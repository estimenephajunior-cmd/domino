import type { MutatorConfig } from './phaseFive.js';
import { timeoutMove } from './speed.js';
import { INVALID_MOVE } from 'boardgame.io/dist/cjs/core.js';
import type { Game } from 'boardgame.io';
import { legalMoves } from './engine.js';
import {
  createTableState,
  drawTileMove,
  mixTilesMove,
  finishMixingMove,
  nextPlayerId,
  passMove,
  pickTileMove,
  playTileMove,
  startNextHand,
} from './moves.js';
import type { End, GameState, PublicGameAction, RuleVariant, Tile } from './types.js';

/**
 * boardgame.io game definition for the Domino Engine.
 * Acts as the authoritative turn-based state machine: phase management,
 * turn advancement, legal-move validation and deterministic undo history.
 *
 * All rule logic lives in `shared/moves.ts`; this module only adapts those
 * pure functions to boardgame.io's (G, playerID) move contract so the server,
 * tests and the local table controller share one implementation.
 */

export interface DominosState extends GameState {
  readonly mutators?: MutatorConfig;
  /** Move log for the replay recorder. */
  readonly history: readonly { playerId: string; tileId: string; end: End }[];
  readonly handNumber: number;
  /** Hand size for the deal; carried across hands for `startNextHand`. */
  readonly handSize: number;
  /** Set when the current player is blocked with no boneyard to draw from. */
  readonly blocked: boolean;
  /** True while the current player must keep drawing (no playable tile yet). */
  readonly drawing: boolean;
  /** Consecutive passes among active seats; a full rotation blocks the hand. */
  readonly passStreak: number;
  readonly publicActions?: readonly PublicGameAction[];
}

export interface DominosSetupData {
  readonly mutators?: MutatorConfig;
  readonly variant: RuleVariant;
  readonly seed: string;
  readonly handSize: number;
  readonly players: readonly { id: string; name: string }[];
}

export const DominosGame: Game<DominosState, Record<string, unknown>, DominosSetupData> = {
  name: 'domino',

  setup: (_context, setupData) => {
    const data = setupData ?? {
      variant: 'block' as RuleVariant,
      seed: 'domino-seed',
      handSize: 6,
      players: [{ id: '0', name: 'Domino' }],
    };
    return createTableState(data.players, data.variant, data.seed, data.handSize, data.mutators);
  },

  moves: {
    mixTiles: ({ G, playerID }, now: number) => {
      if (!playerID) return INVALID_MOVE;
      const outcome = mixTilesMove(G, playerID, now);
      return outcome.ok ? outcome.state : INVALID_MOVE;
    },
    finishMixing: ({ G }, now: number) => {
      const outcome = finishMixingMove(G, now);
      if (!outcome.ok) return INVALID_MOVE;
      return outcome.state;
    },

    pickTile: ({ G, playerID }, slotId: string, now: number) => {
      if (!playerID) return INVALID_MOVE;
      const outcome = pickTileMove(G, playerID, slotId, now);
      return outcome.ok ? outcome.state : INVALID_MOVE;
    },

    /**
     * Play a tile on one end of the chain.
     * The move is rejected (INVALID_MOVE) when it is not the player's turn
     * or the placement breaks the variant rules.
     */
    playTile: ({ G, playerID }, tileId: string, end: End) => {
      if (playerID === null || playerID === undefined) return INVALID_MOVE;
      const outcome = playTileMove(G, playerID, tileId, end);
      return outcome.ok
        ? advance(
            outcome.state,
            G.mutators?.wildDouble === true &&
              outcome.state.lastMove?.tile.low === outcome.state.lastMove?.tile.high,
          )
        : INVALID_MOVE;
    },

    /**
     * Draw a tile from the boneyard. Only legal when the player has no
     * playable tile; the drawer keeps their turn until a drawn tile becomes
     * playable or the boneyard runs dry (classic draw-until-playable rule).
     */
    drawTile: ({ G, playerID }) => {
      if (playerID === null || playerID === undefined) return INVALID_MOVE;
      const outcome = drawTileMove(G, playerID);
      return outcome.ok ? outcome.state : INVALID_MOVE;
    },

    /** Pass the turn when a player is blocked and cannot draw. */
    pass: ({ G, playerID }) => {
      if (playerID === null || playerID === undefined) return INVALID_MOVE;
      const outcome = passMove(G, playerID);
      return outcome.ok ? advance(outcome.state) : INVALID_MOVE;
    },

    timeout: ({ G, playerID }) => {
      if (!playerID || !G.mutators?.speed) return INVALID_MOVE;
      const outcome = timeoutMove(G, playerID);
      return outcome.ok ? advance(outcome.state) : INVALID_MOVE;
    },

    /** Deal the next hand once the current one has finished. */
    nextHand: ({ G, playerID }, seed?: string) => {
      if (playerID === null || playerID === undefined) return INVALID_MOVE;
      const outcome = startNextHand(G, seed);
      return outcome.ok ? outcome.state : INVALID_MOVE;
    },
  },

  // All seats may request the next hand; pure moves enforce actual turn ownership.
  turn: {
    activePlayers: { all: 'play' },
    stages: { play: {} },
    order: {
      playOrder: ({ G }) => G.players.map((p) => p.id),
      first: ({ G }) => G.players.findIndex((p) => p.id === G.currentPlayer),
      next: ({ G }) => G.players.findIndex((p) => p.id === G.currentPlayer),
    },
    endIf: ({ G, ctx }) => G.currentPlayer !== ctx.currentPlayer,
  },
  // A hand ending is not the end of the multi-hand match.
  playerView: ({ G, playerID }) => ({
    ...G,
    seed: '',
    boneyard: [],
    players: G.players.map((p) => ({ ...p, hand: p.id === playerID ? p.hand : [] })),
  }),
};

export { nextPlayerId };

/**
 * Convenience helper used by tests and the AI predictor.
 */
export function playableTiles(G: DominosState, playerId: string): { tile: Tile; end: End }[] {
  const player = G.players.find((p) => p.id === playerId);
  if (!player) return [];
  return legalMoves(player.hand, G.chain, G.variant);
}

function advance(state: DominosState, extraTurn = false): DominosState {
  if (state.phase !== 'awaiting-play' || extraTurn) return state;
  return { ...state, currentPlayer: nextPlayerId(state) ?? state.currentPlayer };
}
