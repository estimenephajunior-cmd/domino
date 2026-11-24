import { describe, expect, it } from 'vitest';
import type { DominosState } from '../../shared/dominosGame.js';
import { hasLegalMove } from '../../shared/engine.js';
import {
  createTableState,
  drawTileMove,
  nextPlayerId,
  passMove,
  playTileMove,
  resolveBlockedHand,
  startNextHand,
} from '../../shared/moves.js';
import type { PlayerState, Tile } from '../../shared/types.js';

function tile(id: string): Tile {
  const [low, high] = id.split('-').map(Number);
  return { id, low: low ?? 0, high: high ?? 0 };
}

function seat(id: string, handIds: string[], score = 0): PlayerState {
  return { id, name: id.toUpperCase(), hand: handIds.map(tile), score, seated: true };
}

/** Fully-formed state: an open 6-6 on the chain, seats p0 (to act) and p1. */
function makeState(overrides: Partial<DominosState> = {}): DominosState {
  return {
    players: [seat('p0', ['0-1', '2-3']), seat('p1', ['4-5', '5-6'])],
    chain: {
      tiles: [{ ...tile('6-6'), left: 6, right: 6 }],
      leftEnd: 6,
      rightEnd: 6,
      spinner: tile('6-6'),
    },
    boneyard: [],
    phase: 'awaiting-play',
    currentPlayer: 'p0',
    turn: 0,
    variant: 'draw',
    winner: null,
    lastMove: null,
    seed: 'test-seed',
    history: [],
    handNumber: 1,
    handSize: 6,
    blocked: false,
    drawing: false,
    passStreak: 0,
    dealerId: 'p0',
    currentPickerId: null,
    mixingEndsAt: null,
    dealSlots: [],
    preferredStarterId: null,
    ...overrides,
  };
}

describe('drawTileMove', () => {
  it('rejects drawing while a playable tile is held', () => {
    const G = makeState({
      players: [seat('p0', ['6-1']), seat('p1', ['0-0'])],
      boneyard: [tile('2-2')],
    });
    const out = drawTileMove(G, 'p0');
    expect(out.ok).toBe(false);
  });

  it('lets the drawer keep drawing until a playable tile appears', () => {
    // p0 cannot match the open 6; only the third boneyard tile (3-6) fits.
    let G = makeState({
      players: [seat('p0', ['0-1']), seat('p1', ['0-2'])],
      boneyard: [tile('1-2'), tile('3-4'), tile('3-6'), tile('5-5')],
    });
    let draws = 0;
    while (!hasLegalMove(G.players[0]?.hand ?? [], G.chain, G.variant) && G.boneyard.length > 0) {
      const out = drawTileMove(G, 'p0');
      expect(out.ok).toBe(true);
      if (!out.ok) break;
      G = out.state;
      draws += 1;
    }
    expect(draws).toBe(3);
    expect(G.currentPlayer).toBe('p0'); // the turn never left the drawer
    expect(G.drawing).toBe(true);
    expect(G.boneyard).toHaveLength(1);
    // Now that p0 can play, further drawing is refused.
    expect(drawTileMove(G, 'p0').ok).toBe(false);
  });

  it('denies drawing when the boneyard is empty', () => {
    const G = makeState({
      players: [seat('p0', ['0-1']), seat('p1', ['0-2'])],
      boneyard: [],
    });
    expect(drawTileMove(G, 'p0').ok).toBe(false);
  });

  it('denies drawing in variants without drawing (Block)', () => {
    const G = makeState({
      players: [seat('p0', ['0-1']), seat('p1', ['0-2'])],
      boneyard: [tile('4-4')],
      variant: 'block',
    });
    const out = drawTileMove(G, 'p0');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/does not allow drawing/i);
  });

  it('rejects out-of-turn draws', () => {
    const G = makeState({
      players: [seat('p0', ['0-1']), seat('p1', ['0-2'])],
      boneyard: [tile('3-3')],
    });
    expect(drawTileMove(G, 'p1').ok).toBe(false);
  });
});

describe('passMove', () => {
  it('rejects passing with a playable tile', () => {
    const G = makeState({ players: [seat('p0', ['6-1']), seat('p1', ['0-0'])] });
    expect(passMove(G, 'p0').ok).toBe(false);
  });

  it('rejects passing while draws remain in a draw variant', () => {
    const G = makeState({
      players: [seat('p0', ['0-1']), seat('p1', ['0-2'])],
      boneyard: [tile('4-4')],
      variant: 'draw',
    });
    expect(passMove(G, 'p0').ok).toBe(false);
  });

  it('marks the table blocked on a legal pass', () => {
    const G = makeState({
      players: [seat('p0', ['0-1']), seat('p1', ['0-2'])],
      boneyard: [],
      variant: 'draw',
    });
    const out = passMove(G, 'p0');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.blocked).toBe(true);
    expect(out.state.passStreak).toBe(1);
    expect(out.state.phase).toBe('awaiting-play'); // p1 still has tiles
  });

  it('resolves a fully blocked hand after every seat passes', () => {
    // Block variant: no drawing, so both seats can pass immediately.
    const first = passMove(
      makeState({
        players: [seat('p0', ['4-5']), seat('p1', ['0-1'])], // neither matches the 6
        variant: 'block',
      }),
      'p0',
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Simulate the turn advancing to p1, who is also stuck.
    const second = passMove({ ...first.state, currentPlayer: 'p1' }, 'p1');
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.state.phase).toBe('hand-complete');
    // Fewest remaining pips (p1: 1 vs p0: 11) wins the blocked hand: +1 in Block.
    expect(second.state.winner).toBe('p1');
    expect(second.state.players.find((p) => p.id === 'p1')?.score).toBe(1);
    expect(second.state.players.find((p) => p.id === 'p0')?.score).toBe(0);
  });
});

describe('playTileMove', () => {
  it('places a matching tile and appends to history', () => {
    const G = makeState({ players: [seat('p0', ['6-1', '2-3']), seat('p1', ['4-5'])] });
    const out = playTileMove(G, 'p0', '6-1', 'left');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.chain.leftEnd).toBe(1);
    expect(out.state.chain.rightEnd).toBe(6);
    expect(out.state.history).toHaveLength(1);
    expect(out.state.phase).toBe('awaiting-play');
    // Turn advancement belongs to the caller (bgio turn order / controller).
    expect(out.state.currentPlayer).toBe('p0');
  });

  it('ends the hand and scores when a player goes out', () => {
    const G = makeState({
      players: [seat('p0', ['6-1']), seat('p1', ['4-5'])],
      variant: 'block',
    });
    const out = playTileMove(G, 'p0', '6-1', 'left');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.phase).toBe('hand-complete');
    expect(out.state.winner).toBe('p0');
    expect(out.state.players.find((p) => p.id === 'p0')?.score).toBe(1);
  });

  it('rejects illegal placements and out-of-turn moves', () => {
    const G = makeState({ players: [seat('p0', ['0-1']), seat('p1', ['4-5'])] });
    expect(playTileMove(G, 'p0', '0-1', 'left').ok).toBe(false);
    expect(playTileMove(G, 'p1', '4-5', 'left').ok).toBe(false);
    expect(playTileMove(G, 'p0', '9-9', 'left').ok).toBe(false);
  });
});

describe('startNextHand', () => {
  it('refuses to deal while a hand is still running', () => {
    expect(startNextHand(makeState()).ok).toBe(false);
  });

  it('deals a fresh hand carrying scores forward', () => {
    const table = createTableState(
      [
        { id: 'p0', name: 'Ana' },
        { id: 'p1', name: 'Bo' },
      ],
      'block',
      'round-seed',
      4,
    );
    const finished: DominosState = {
      ...table,
      phase: 'hand-complete',
      winner: 'p0',
      players: table.players.map((p) => ({ ...p, score: p.score + 7 })),
    };
    const out = startNextHand(finished);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const next = out.state;
    expect(next.phase).toBe('mixing');
    expect(next.handNumber).toBe(2);
    expect(next.seed).not.toBe(finished.seed);
    expect(next.players.every((p) => p.score === 7)).toBe(true);
    // The opening tile moves from the opener's hand to the chain, so hands
    // hold handSize or handSize-1 tiles: 4+4 dealt, minus the one on the chain.
    expect(next.players.every((player) => player.hand.length === 0)).toBe(true);
    // 8 dealt + 1 on the chain + boneyard = the full 28-tile set.
    expect(next.dealSlots).toHaveLength(28);
    // The new opener — whoever holds the opening double — holds the turn.
    expect(next.preferredStarterId).toBe('p0');
    expect(next.dealerId).toBe('p1');
  });
});

describe('resolveBlockedHand', () => {
  it('awards pip totals to the fewest-pips seat (All Fives)', () => {
    const G = makeState({
      players: [seat('p0', ['5-6']), seat('p1', ['0-1'])],
      variant: 'all-fives',
    });
    const out = resolveBlockedHand(G);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.phase).toBe('hand-complete');
    expect(out.state.winner).toBe('p1');
    expect(out.state.players.find((p) => p.id === 'p1')?.score).toBe(10);
  });

  it('scores nothing when the top pip totals tie', () => {
    const G = makeState({
      players: [seat('p0', ['4-6']), seat('p1', ['5-5'])], // both 10 pips
      variant: 'all-fives',
    });
    const out = resolveBlockedHand(G);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.phase).toBe('hand-complete');
    expect(out.state.winner).toBeNull();
    expect(out.state.players.every((p) => p.score === 0)).toBe(true);
  });
});

describe('nextPlayerId', () => {
  it('skips seats that have gone out', () => {
    const G = makeState({
      players: [seat('p0', ['0-1']), seat('p1', []), seat('p2', ['2-3'])],
      currentPlayer: 'p0',
    });
    expect(nextPlayerId(G)).toBe('p2');
    expect(nextPlayerId({ ...G, currentPlayer: 'p2' })).toBe('p0');
  });

  it('returns null when no hand remains', () => {
    const G = makeState({ players: [seat('p0', []), seat('p1', [])] });
    expect(nextPlayerId(G)).toBeNull();
  });
});
