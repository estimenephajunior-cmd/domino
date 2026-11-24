import { applyPassPenalty, DEFAULT_MUTATORS } from './mutators.js';
import type { MutatorConfig } from './phaseFive.js';
import { openEnds, scoreExposedEnds } from './graph.js';
import { teamOfSeat } from './types.js';
import {
  createInitialState,
  drawFromBoneyard,
  hasLegalMove,
  legalMoves,
  openingPlayer,
  playTile,
  scoreHand,
  tilePips,
} from './engine.js';
import type { DominosState } from './dominosGame.js';
import { VARIANT_RULES } from './types.js';
import type { End, RuleVariant } from './types.js';

/**
 * Pure move functions for the Domino Engine state machine.
 *
 * The boardgame.io game definition wraps these as validated moves for the
 * authoritative P2P flow, while the local table controller (hot-seat and
 * Shadow AI) calls them directly — one rules implementation, two transports.
 *
 * No boardgame.io imports here: this module stays free of framework concerns
 * so the browser client can share it with the server.
 */

export type MoveOutcome =
  | { readonly ok: true; readonly state: DominosState }
  | { readonly ok: false; readonly reason: string };

function invalid(reason: string): MoveOutcome {
  return { ok: false, reason };
}

function ok(state: DominosState): MoveOutcome {
  return { ok: true, state };
}

export const BWAS_MIX_MS = 4500;

/** Start the physical mixing animation. Only the rotating dealer may do this. */
export function mixTilesMove(G: DominosState, playerId: string, now: number): MoveOutcome {
  if (G.phase !== 'mixing') return invalid('The tiles are not ready to mix.');
  if (G.dealerId !== playerId) return invalid('Only the dealer can mix the tiles.');
  if (G.mixingEndsAt !== null) return invalid('The tiles are already mixing.');
  return ok({ ...G, mixingEndsAt: now + BWAS_MIX_MS });
}

/** Advance the public deal stage after the server-owned mixing deadline. */
export function finishMixingMove(G: DominosState, now: number): MoveOutcome {
  if (G.phase !== 'mixing' || G.mixingEndsAt === null)
    return invalid('The tiles are not mixing.');
  if (now < G.mixingEndsAt) return invalid('The tiles are still mixing.');
  return ok({ ...G, phase: 'picking' });
}

/** Claim one opaque face-down slot; every player may pick at their own pace. */
export function pickTileMove(
  G: DominosState,
  playerId: string,
  slotId: string,
  now: number,
): MoveOutcome {
  if (G.phase !== 'mixing' && G.phase !== 'picking') return invalid('Picking is closed.');
  if (G.mixingEndsAt === null || now < G.mixingEndsAt)
    return invalid('The tiles are still mixing.');
  const slotIndex = G.dealSlots.findIndex((slot) => slot.id === slotId);
  const slot = G.dealSlots[slotIndex];
  if (!slot || slot.claimedBy) return invalid('That tile has already been picked.');
  const playerIndex = G.players.findIndex((player) => player.id === playerId);
  const player = G.players[playerIndex];
  if (!player || player.hand.length >= G.handSize) return invalid('Your rack is already full.');
  const players = [...G.players];
  players[playerIndex] = { ...player, hand: [...player.hand, slot.tile] };
  const dealSlots = [...G.dealSlots];
  dealSlots[slotIndex] = { ...slot, claimedBy: playerId };
  const complete = players.every((entry) => entry.hand.length === G.handSize);
  if (complete) {
    return ok({
      ...G,
      players,
      dealSlots,
      boneyard: dealSlots.filter((entry) => !entry.claimedBy).map((entry) => entry.tile),
      phase: 'awaiting-play',
      currentPickerId: null,
      currentPlayer: G.preferredStarterId ?? openingPlayer(players),
      mixingEndsAt: null,
    });
  }
  return ok({
    ...G,
    players,
    dealSlots,
    phase: 'picking',
    currentPickerId: null,
  });
}

/** Fresh table state carrying the bookkeeping fields the engine does not own. */
export function createTableState(
  players: readonly { id: string; name: string }[],
  variant: RuleVariant,
  seed: string,
  handSize: number,
  mutators: MutatorConfig = DEFAULT_MUTATORS,
): DominosState {
  const base = createInitialState(players, variant, seed, handSize);
  return {
    ...base,
    mutators: { ...mutators },
    history: [],
    handNumber: 1,
    handSize,
    blocked: false,
    drawing: false,
    passStreak: 0,
    publicActions: [],
  };
}

/** Play a tile on one end of the chain; ends the hand when a player goes out. */
export function playTileMove(
  G: DominosState,
  playerId: string,
  tileId: string,
  end: End,
): MoveOutcome {
  if (G.phase !== 'awaiting-play') return invalid('The hand is not in play.');
  if (G.currentPlayer !== playerId) return invalid('It is not your turn.');

  const idx = G.players.findIndex((p) => p.id === playerId);
  const player = G.players[idx];
  if (!player) return invalid('Seat not found.');
  const tile = player.hand.find((t) => t.id === tileId);
  if (!tile) return invalid('That tile is not in your hand.');

  const allowed = legalMoves(player.hand, G.chain, G.variant);
  if (!allowed.some((m) => m.tile.id === tileId && m.end === end)) {
    return invalid('That placement breaks the chain.');
  }

  const chain = playTile(G.chain, tile, end, G.variant);
  const hand = player.hand.filter((t) => t.id !== tileId);
  const players = [...G.players];
  players[idx] = {
    ...player,
    hand,
    score: player.score + (G.variant === 'all-fives' ? scoreExposedEnds(chain) : 0),
  };
  const history = [...G.history, { playerId, tileId, end }];
  const lastMove = { playerId, tile, end };
  const publicActions = [
    ...(G.publicActions ?? []),
    { type: 'play' as const, playerId, tile, end, turn: G.turn },
  ];

  if (hand.length === 0) {
    const deltas = scoreHand(players, playerId, G.variant);
    const scored = players.map((p) => ({ ...p, score: p.score + (deltas[p.id] ?? 0) }));
    return ok({
      ...G,
      players: scored,
      chain,
      phase: 'hand-complete',
      turn: G.turn + 1,
      winner: playerId,
      lastMove,
      history,
      publicActions,
      blocked: false,
      drawing: false,
      passStreak: 0,
    });
  }

  return ok({
    ...G,
    players,
    chain,
    phase: 'awaiting-play',
    turn: G.turn + 1,
    lastMove,
    history,
    publicActions,
    blocked: false,
    drawing: false,
    passStreak: 0,
  });
}

/**
 * Draw one tile from the boneyard. The turn is NOT surrendered: classic draw
 * rules keep the drawer at the table until they can play or the yard is empty.
 */
export function drawTileMove(G: DominosState, playerId: string): MoveOutcome {
  if (G.phase !== 'awaiting-play') return invalid('The hand is not in play.');
  if (G.currentPlayer !== playerId) return invalid('It is not your turn.');
  if (!VARIANT_RULES[G.variant].allowDraw) {
    return invalid('This variant does not allow drawing.');
  }

  const idx = G.players.findIndex((p) => p.id === playerId);
  const player = G.players[idx];
  if (!player) return invalid('Seat not found.');
  if (hasLegalMove(player.hand, G.chain, G.variant)) {
    return invalid('You already hold a playable tile.');
  }

  const drawn = drawFromBoneyard(G.boneyard);
  if (!drawn) return invalid('The boneyard is empty.');

  const players = [...G.players];
  players[idx] = { ...player, hand: [...player.hand, drawn] };
  return ok({
    ...G,
    players,
    boneyard: G.boneyard.slice(1),
    turn: G.turn + 1,
    blocked: false,
    // The drawer keeps the turn (see DominosGame.turn.endIf) until a drawn
    // tile is playable or the boneyard runs dry — draw until playable.
    drawing: true,
    publicActions: [
      ...(G.publicActions ?? []),
      { type: 'draw', playerId, count: 1, turn: G.turn },
    ],
  });
}

/** Pass when — and only when — no tile can be played and no draw is possible. */
export function passMove(G: DominosState, playerId: string): MoveOutcome {
  if (G.phase === 'hand-complete' || G.phase === 'game-over') {
    return invalid('The hand is over.');
  }
  if (G.currentPlayer !== playerId) return invalid('It is not your turn.');
  const me = G.players.find((p) => p.id === playerId);
  if (!me) return invalid('Seat not found.');
  if (hasLegalMove(me.hand, G.chain, G.variant)) {
    return invalid('You still have a playable tile.');
  }
  if (VARIANT_RULES[G.variant].allowDraw && G.boneyard.length > 0) {
    return invalid('Draw from the boneyard first.');
  }

  const penalized = applyPassPenalty(G, playerId);
  const passStreak = penalized === G ? G.passStreak + 1 : 0;
  const passed: DominosState = {
    ...penalized,
    blocked: true,
    drawing: false,
    passStreak,
    publicActions: [
      ...(G.publicActions ?? []),
      {
        type: 'pass',
        playerId,
        openPips: [...new Set(openEnds(G.chain).map((target) => target.pip))],
        turn: G.turn,
      },
    ],
    turn: G.turn + 1,
  };
  // A full rotation of consecutive passes deadlocks the hand — resolve it.
  const activeSeats = passed.players.filter((p) => p.hand.length > 0).length;
  return passStreak >= activeSeats ? resolveBlockedHand(passed) : ok(passed);
}

/**
 * End a fully blocked hand: the seat with the fewest remaining pips collects
 * the losers' totals; a tie at the top scores nothing.
 */
export function resolveBlockedHand(G: DominosState): MoveOutcome {
  if (G.phase !== 'awaiting-play') return invalid('The hand is not in play.');
  if (G.variant === 'latin') {
    const sums = [0, 0];
    G.players.forEach((p, index) => {
      sums[teamOfSeat(index)]! += p.hand.reduce((sum, tile) => sum + tilePips(tile), 0);
    });
    if (sums[0] === sums[1])
      return ok({ ...G, phase: 'hand-complete', winner: null, blocked: true });
    const winningTeam = sums[0]! < sums[1]! ? 0 : 1;
    const winner = G.players.find((_, index) => teamOfSeat(index) === winningTeam);
    if (!winner) return invalid('Winning team has no seat.');
    const deltas = scoreHand(G.players, winner.id, G.variant);
    return ok({
      ...G,
      players: G.players.map((p) => ({ ...p, score: p.score + (deltas[p.id] ?? 0) })),
      phase: 'hand-complete',
      winner: winner.id,
      blocked: true,
    });
  }
  const totals = G.players.map((p) => ({
    id: p.id,
    pips: p.hand.reduce((sum, t) => sum + tilePips(t), 0),
  }));
  const sorted = [...totals].sort((a, b) => a.pips - b.pips);
  const best = sorted[0];
  const runnerUp = sorted[1];
  const tiedOpponent =
    best &&
    sorted.some(
      (entry) =>
        entry.id !== best.id &&
        entry.pips === best.pips &&
        (G.variant !== 'caribbean' ||
          teamOfSeat(G.players.findIndex((p) => p.id === entry.id)) !==
            teamOfSeat(G.players.findIndex((p) => p.id === best.id))),
    );
  if (!best || !runnerUp || tiedOpponent) {
    return ok({ ...G, phase: 'hand-complete', winner: null, blocked: true });
  }
  const deltas = scoreHand(G.players, best.id, G.variant);
  const players = G.players.map((p) => ({ ...p, score: p.score + (deltas[p.id] ?? 0) }));
  return ok({ ...G, players, phase: 'hand-complete', winner: best.id, blocked: true });
}

/** Deal the next hand, carrying scores forward with a derived seed. */
export function startNextHand(G: DominosState, seed?: string): MoveOutcome {
  if (G.phase !== 'hand-complete') return invalid('The hand has not finished.');
  const handNumber = G.handNumber + 1;
  const fresh = createTableState(
    G.players.map((p) => ({ id: p.id, name: p.name })),
    G.variant,
    seed ?? `${G.seed}·${handNumber}`,
    G.handSize,
    G.mutators,
  );
  const scores = new Map(G.players.map((p) => [p.id, p.score]));
  const dealerIndex = G.players.findIndex((player) => player.id === G.dealerId);
  const dealerId = G.players[(dealerIndex + 1 + G.players.length) % G.players.length]?.id ?? '';
  return ok({
    ...fresh,
    players: fresh.players.map((p) => ({ ...p, score: (scores.get(p.id) ?? 0) + p.score })),
    handNumber,
    dealerId,
    currentPlayer: dealerId,
    preferredStarterId: G.winner,
  });
}

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
