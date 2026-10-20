import { INVALID_MOVE, TurnOrder } from 'boardgame.io/core';
import type { Game } from 'boardgame.io';
import {
  createInitialState,
  drawFromBoneyard,
  hasLegalMove,
  legalMoves,
  playTile,
  scoreHand,
} from './engine.js';
import type { End, GameState, RuleVariant, Tile } from './types.js';

/**
 * boardgame.io game definition for the Domino Engine.
 * Acts as the authoritative turn-based state machine: phase management,
 * turn advancement, legal-move validation and deterministic undo history.
 */

export interface DominosState extends GameState {
  /** Move log for the replay recorder. */
  readonly history: readonly { playerId: string; tileId: string; end: End }[];
  readonly handNumber: number;
  /** Set when the current player is blocked with no boneyard to draw from. */
  readonly blocked: boolean;
}

export interface DominosSetupData {
  readonly variant: RuleVariant;
  readonly seed: string;
  readonly handSize: number;
  readonly players: readonly { id: string; name: string }[];
}

export const DominosGame: Game<DominosState, Record<string, never>, DominosSetupData> = {
  name: 'domino',

  setup: (_context, setupData) => {
    const data = setupData ?? {
      variant: 'block' as RuleVariant,
      seed: 'domino-seed',
      handSize: 6,
      players: [{ id: '0', name: 'Player 1' }],
    };
    const base = createInitialState(data.players, data.variant, data.seed, data.handSize);
    return {
      ...base,
      history: [],
      handNumber: 1,
      blocked: false,
    };
  },

  moves: {
    /**
     * Play a tile on one end of the chain.
     * The move is rejected (INVALID_MOVE) when it is not the player's turn
     * or the placement breaks the variant rules.
     */
    playTile: ({ G, playerID }, tileId: string, end: End) => {
      if (playerID === null || playerID === undefined) return INVALID_MOVE;
      if (G.phase !== 'awaiting-play') return INVALID_MOVE;

      const idx = G.players.findIndex((p) => p.id === playerID);
      const player = G.players[idx];
      if (!player) return INVALID_MOVE;
      if (G.currentPlayer !== playerID) return INVALID_MOVE;

      const tile = player.hand.find((t) => t.id === tileId);
      if (!tile) return INVALID_MOVE;

      const allowed = legalMoves(player.hand, G.chain, G.variant);
      if (!allowed.some((m) => m.tile.id === tileId && m.end === end)) {
        return INVALID_MOVE;
      }

      const chain = playTile(G.chain, tile, end, G.variant);
      const hand = player.hand.filter((t) => t.id !== tileId);
      const players = [...G.players];
      players[idx] = { ...player, hand };

      const wentOut = hand.length === 0;
      if (wentOut) {
        const deltas = scoreHand(players, playerID, G.variant);
        const scored = players.map((p) => ({
          ...p,
          score: p.score + (deltas[p.id] ?? 0),
        }));
        return {
          ...G,
          players: scored,
          chain,
          phase: 'hand-complete' as const,
          winner: playerID,
          lastMove: { playerId: playerID, tile, end },
          history: [...G.history, { playerId: playerID, tileId, end }],
        };
      }

      return {
        ...G,
        players,
        chain,
        phase: 'awaiting-play' as const,
        turn: G.turn + 1,
        lastMove: { playerId: playerID, tile, end },
        history: [...G.history, { playerId: playerID, tileId, end }],
        blocked: false,
      };
    },

    /**
     * Draw a tile from the boneyard. Only legal when the player has no
     * playable tile and the variant permits drawing.
     */
    drawTile: ({ G, playerID }) => {
      if (playerID === null || playerID === undefined) return INVALID_MOVE;
      if (G.phase !== 'awaiting-play') return INVALID_MOVE;
      if (G.currentPlayer !== playerID) return INVALID_MOVE;

      const idx = G.players.findIndex((p) => p.id === playerID);
      const player = G.players[idx];
      if (!player) return INVALID_MOVE;
      if (hasLegalMove(player.hand, G.chain, G.variant)) return INVALID_MOVE;

      const drawn = drawFromBoneyard(G.boneyard);
      if (!drawn) return INVALID_MOVE;

      const players = [...G.players];
      players[idx] = { ...player, hand: [...player.hand, drawn] };
      return {
        ...G,
        players,
        boneyard: G.boneyard.slice(1),
        phase: 'awaiting-play' as const,
        turn: G.turn + 1,
        blocked: false,
      };
    },

    /** Pass the turn when a player is blocked and cannot draw. */
    pass: ({ G, playerID }) => {
      if (playerID === null || playerID === undefined) return INVALID_MOVE;
      if (G.currentPlayer !== playerID) return INVALID_MOVE;
      const me = G.players.find((p) => p.id === playerID);
      if (hasLegalMove(me?.hand ?? [], G.chain, G.variant)) return INVALID_MOVE;
      return { ...G, blocked: true, turn: G.turn + 1 };
    },
  },

  turn: {
    order: TurnOrder.DEFAULT,
    // Skip seats that have already gone out, so the turn never lands on an
    // empty hand. Returning `{ next }` lets boardgame.io jump directly to
    // the next player who still holds tiles.
    endIf: ({ G }) => {
      if (G.phase === 'hand-complete') return false;
      const next = nextPlayerId(G);
      if (next === null) return false;
      return { next };
    },
  },

  endIf: ({ G }) => (G.phase === 'hand-complete' ? G.winner : undefined),
};

/**
 * Id of the next player who still holds tiles, or null when the hand is over.
 * Scans forward from the current player in seating order.
 */
export function nextPlayerId(G: DominosState): string | null {
  const count = G.players.length;
  if (count === 0) return null;
  const current = G.players.findIndex((p) => p.id === G.currentPlayer);
  const base = current === -1 ? 0 : current;
  for (let step = 1; step <= count; step++) {
    const idx = (base + step) % count;
    const player = G.players[idx];
    if (player && player.hand.length > 0) return player.id;
  }
  return null;
}

/** Convenience helper used by tests and the AI predictor. */
export function playableTiles(
  G: DominosState,
  playerId: string,
): { tile: Tile; end: End }[] {
  const player = G.players.find((p) => p.id === playerId);
  if (!player) return [];
  return legalMoves(player.hand, G.chain, G.variant);
}
