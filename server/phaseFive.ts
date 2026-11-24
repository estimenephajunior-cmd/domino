import { nanoid } from 'nanoid';
import type { State } from 'boardgame.io';
import type { DominosState } from '../shared/dominosGame.js';
import { DEFAULT_MUTATORS } from '../shared/mutators.js';
import {
  SPEED_TURN_MS,
  UNDO_REQUEST_MS,
  UNDO_VOTE_MS,
  type PhaseFiveView,
  type UndoVote,
} from '../shared/phaseFive.js';
import type { GameRuntime } from './gameRuntime.js';

interface Checkpoint {
  readonly state: State<DominosState>;
  readonly remaining: number | null;
}
interface Candidate extends Checkpoint {
  readonly actor: string;
  readonly expiresAt: number;
}

/** Server-owned clocks and one cached reducer snapshot per table. Nothing private enters view(). */
export class PhaseFiveSession {
  private candidate: Candidate | null = null;
  private vote: UndoVote | null = null;
  private result: PhaseFiveView['undo']['result'] = null;
  private deadline: number | null = null;
  private pausedRemaining: number | null = null;
  private timeoutSequence = 0;
  private speedTimer: ReturnType<typeof setTimeout> | null = null;
  private undoTimer: ReturnType<typeof setTimeout> | null = null;
  private voteTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    private readonly runtime: GameRuntime,
    private readonly changed: () => void,
  ) {
    this.armSpeed(SPEED_TURN_MS);
  }

  view(): PhaseFiveView {
    return {
      mutators: this.runtime.game.mutators ?? DEFAULT_MUTATORS,
      serverNow: Date.now(),
      turnDeadline: this.deadline,
      timeoutSequence: this.timeoutSequence,
      undo: {
        availableFor: this.candidate && !this.vote ? this.candidate.actor : null,
        requestExpiresAt: this.candidate && !this.vote ? this.candidate.expiresAt : null,
        vote: this.vote,
        result: this.result,
      },
    };
  }

  get voting(): boolean {
    return this.vote !== null;
  }

  checkpoint(): Checkpoint {
    return {
      state: this.runtime.snapshot(),
      remaining: this.deadline === null ? null : Math.max(0, this.deadline - Date.now()),
    };
  }

  committed(type: 'playTile' | 'drawTile' | 'pass' | 'nextHand', checkpoint: Checkpoint): void {
    this.clearCandidate();
    this.result = null;
    if (type === 'playTile' && this.runtime.game.phase === 'awaiting-play') {
      this.candidate = {
        ...checkpoint,
        actor: checkpoint.state.G.currentPlayer,
        expiresAt: Date.now() + UNDO_REQUEST_MS,
      };
      this.undoTimer = setTimeout(() => {
        this.clearCandidate();
        this.changed();
      }, UNDO_REQUEST_MS);
      this.undoTimer.unref?.();
    }
    // Drawing consumes time from the same turn; a double's extra turn gets a fresh clock.
    if (type !== 'drawTile' || this.runtime.game.phase !== 'awaiting-play')
      this.armSpeed(SPEED_TURN_MS);
  }

  /** Called before socket actions as well as timer callbacks, so late packets cannot beat a deadline. */
  synchronize(): void {
    if (this.disposed) return;
    if (this.vote && Date.now() >= this.vote.expiresAt) this.finishVote('expired');
    if (!this.vote && this.candidate && Date.now() >= this.candidate.expiresAt)
      this.clearCandidate();
    if (!this.vote && this.deadline !== null && Date.now() >= this.deadline) {
      this.clearCandidate();
      this.result = null;
      if (this.runtime.move(this.runtime.game.currentPlayer, 'timeout')) this.timeoutSequence++;
      this.armSpeed(SPEED_TURN_MS);
      this.changed();
    }
  }

  request(playerId: string): string | null {
    this.synchronize();
    if (this.vote) return 'An undo vote is already in progress.';
    if (
      !this.candidate ||
      this.candidate.actor !== playerId ||
      Date.now() >= this.candidate.expiresAt
    ) {
      return 'Only your latest placement can be undone, within five seconds and before another action.';
    }
    const eligible = this.runtime.game.players.map((player) => player.id);
    this.pausedRemaining = this.deadline === null ? null : Math.max(0, this.deadline - Date.now());
    this.clearSpeed();
    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.undoTimer = null;
    this.vote = {
      id: nanoid(10),
      requesterId: playerId,
      eligible,
      yes: [playerId],
      no: [],
      expiresAt: Date.now() + UNDO_VOTE_MS,
    };
    this.voteTimer = setTimeout(() => this.synchronize(), UNDO_VOTE_MS);
    this.voteTimer.unref?.();
    this.changed();
    return null;
  }

  cast(playerId: string, voteId: string, approve: boolean): string | null {
    this.synchronize();
    const vote = this.vote;
    if (!vote || vote.id !== voteId || !vote.eligible.includes(playerId))
      return 'This undo vote is no longer available.';
    if (vote.yes.includes(playerId) || vote.no.includes(playerId)) return 'You have already voted.';
    this.vote = {
      ...vote,
      yes: approve ? [...vote.yes, playerId] : vote.yes,
      no: approve ? vote.no : [...vote.no, playerId],
    };
    const majority = Math.floor(vote.eligible.length / 2) + 1;
    if (this.vote.yes.length >= majority) this.finishVote('approved');
    else if (vote.eligible.length - this.vote.no.length < majority) this.finishVote('rejected');
    else this.changed();
    return null;
  }

  dispose(): void {
    this.disposed = true;
    this.clearSpeed();
    this.clearCandidate();
    if (this.voteTimer) clearTimeout(this.voteTimer);
    this.vote = null;
  }

  private finishVote(result: 'approved' | 'rejected' | 'expired'): void {
    const candidate = this.candidate;
    if (this.voteTimer) clearTimeout(this.voteTimer);
    this.voteTimer = null;
    this.vote = null;
    this.result = result;
    if (result === 'approved' && candidate) this.runtime.restore(candidate.state);
    const remaining = result === 'approved' ? candidate?.remaining : this.pausedRemaining;
    this.clearCandidate();
    this.pausedRemaining = null;
    this.armSpeed(remaining ?? SPEED_TURN_MS);
    this.changed();
  }

  private clearCandidate(): void {
    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.undoTimer = null;
    this.candidate = null;
  }

  private clearSpeed(): void {
    if (this.speedTimer) clearTimeout(this.speedTimer);
    this.speedTimer = null;
    this.deadline = null;
  }

  private armSpeed(remaining: number): void {
    this.clearSpeed();
    if (
      this.disposed ||
      !this.runtime.game.mutators?.speed ||
      this.runtime.game.phase !== 'awaiting-play'
    )
      return;
    this.deadline = Date.now() + Math.max(0, remaining);
    this.speedTimer = setTimeout(() => this.synchronize(), Math.max(0, remaining));
    this.speedTimer.unref?.();
  }
}
