import { describe, expect, it } from 'vitest';
import { legalMoves, openingPlayer } from '../../shared/engine.js';
import {
  BWAS_MIX_MS,
  createTableState,
  mixTilesMove,
  finishMixingMove,
  pickTileMove,
  playTileMove,
  startNextHand,
} from '../../shared/moves.js';
import { handSizeFor } from '../../shared/rules.js';

const players = [
  { id: 'a', name: 'Ana' },
  { id: 'b', name: 'Beto' },
];

function finishPicking(seed = 'physical') {
  let state = createTableState(players, 'draw', seed, 7);
  const mixed = mixTilesMove(state, 'a', 1000);
  expect(mixed.ok).toBe(true);
  if (!mixed.ok) throw new Error(mixed.reason);
  state = mixed.state;
  expect(state.mixingEndsAt).toBe(1000 + BWAS_MIX_MS);
  for (let index = 0; index < 14; index++) {
    const picker = state.players.find((player) => player.hand.length < 7)!.id;
    const slot = state.dealSlots.find((entry) => !entry.claimedBy)!;
    const picked = pickTileMove(state, picker, slot.id, 1000 + BWAS_MIX_MS);
    expect(picked.ok).toBe(true);
    if (!picked.ok) throw new Error(picked.reason);
    state = picked.state;
  }
  return state;
}

describe('physical Bwas deal', () => {
  it('uses seven tiles for every enabled double-six variant', () => {
    for (const variant of ['block', 'draw', 'all-fives', 'latin'] as const)
      expect(handSizeFor(variant, variant === 'latin' ? 4 : 2)).toBe(7);
  });

  it('allows only the dealer to mix and locks picks for 4.5 seconds', () => {
    const state = createTableState(players, 'draw', 'lock', 7);
    expect(mixTilesMove(state, 'b', 10).ok).toBe(false);
    const mixed = mixTilesMove(state, 'a', 10);
    expect(mixed.ok).toBe(true);
    if (!mixed.ok) return;
    expect(pickTileMove(mixed.state, 'a', 'slot-0', 4509).ok).toBe(false);
    const picking = finishMixingMove(mixed.state, 4510);
    expect(picking.ok && picking.state.phase).toBe('picking');
    expect(pickTileMove(mixed.state, 'a', 'slot-0', 4510).ok).toBe(true);
  });

  it('allows independent private picks, leaves fourteen in a two-player yard and starts empty', () => {
    const state = finishPicking();
    expect(state.phase).toBe('awaiting-play');
    expect(state.players.map((player) => player.hand.length)).toEqual([7, 7]);
    expect(state.boneyard).toHaveLength(14);
    expect(state.chain.tiles).toHaveLength(0);
    expect(state.currentPlayer).toBe(openingPlayer(state.players));
    expect(state.dealSlots.filter((slot) => slot.claimedBy)).toHaveLength(14);
  });

  it('lets the opener choose any tile and rotates dealer while the winner starts next', () => {
    const state = finishPicking('opening');
    const starter = state.players.find((player) => player.id === state.currentPlayer)!;
    expect(legalMoves(starter.hand, state.chain, state.variant)).toHaveLength(7);
    const chosen = starter.hand.at(-1)!;
    const opened = playTileMove(state, starter.id, chosen.id, 'right');
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.state.chain.tiles[0]?.id).toBe(chosen.id);
    const next = startNextHand({ ...opened.state, phase: 'hand-complete', winner: 'b' }, 'next');
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.state.dealerId).toBe('b');
    expect(next.state.preferredStarterId).toBe('b');
    expect(next.state.phase).toBe('mixing');
  });
});
