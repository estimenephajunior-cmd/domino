export interface MutatorConfig {
  readonly speed: boolean;
  readonly wildDouble: boolean;
  readonly hotPotato: boolean;
}

export const SPEED_TURN_MS = 10_000;
export const UNDO_REQUEST_MS = 5_000;
export const UNDO_VOTE_MS = 10_000;

export interface UndoVote {
  readonly id: string;
  readonly requesterId: string;
  readonly expiresAt: number;
  readonly eligible: readonly string[];
  readonly yes: readonly string[];
  readonly no: readonly string[];
}

export interface PhaseFiveView {
  readonly mutators: MutatorConfig;
  readonly serverNow: number;
  readonly turnDeadline: number | null;
  readonly timeoutSequence: number;
  readonly undo: {
    readonly availableFor: string | null;
    readonly requestExpiresAt: number | null;
    readonly vote: UndoVote | null;
    readonly result: 'approved' | 'rejected' | 'expired' | null;
  };
}
