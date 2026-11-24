import { CreateGameReducer, InitializeGame } from 'boardgame.io/dist/cjs/internal.js';
import type { State } from 'boardgame.io';
import { DominosGame, type DominosSetupData, type DominosState } from '../shared/dominosGame.js';

const reduce = CreateGameReducer({ game: DominosGame });

/** One server-only boardgame.io state machine; clients never receive its logs or undo stack. */
export class GameRuntime {
  private state: State<DominosState>;

  constructor(setupData: DominosSetupData) {
    this.state = InitializeGame({
      game: DominosGame,
      numPlayers: setupData.players.length,
      setupData,
    });
  }

  get game(): DominosState {
    return this.state.G;
  }

  /** The reducer creates immutable states; a single reference is a bounded undo cache. */
  snapshot(): State<DominosState> {
    return this.state;
  }

  restore(snapshot: State<DominosState>): void {
    this.state = { ...snapshot, _stateID: this.state._stateID + 1, _undo: [], _redo: [] };
  }

  move(
    playerID: string,
    type:
      | 'mixTiles'
      | 'finishMixing'
      | 'pickTile'
      | 'playTile'
      | 'drawTile'
      | 'pass'
      | 'nextHand'
      | 'timeout',
    args: readonly unknown[] = [],
  ): boolean {
    const next = reduce(this.state, { type: 'MAKE_MOVE', payload: { type, args, playerID } });
    if (next._stateID === this.state._stateID || next.transients?.error) return false;
    this.state = next;
    return true;
  }
}
