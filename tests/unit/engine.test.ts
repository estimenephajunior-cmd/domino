import { describe, expect, it } from 'vitest';
import {
  commitShuffle,
  createDoubleSixSet,
  createInitialState,
  deal,
  drawFromBoneyard,
  fnv1a,
  hasLegalMove,
  legalMoves,
  playTile,
  scoreHand,
  shuffleTiles,
  tilePips,
} from '../../shared/engine.js';
import type { Chain, PlayerState } from '../../shared/types.js';

const PLAYERS = [
  { id: 'p0', name: 'Ana' },
  { id: 'p1', name: 'Bo' },
];

describe('createDoubleSixSet', () => {
  it('creates 28 unique tiles with low <= high', () => {
    const tiles = createDoubleSixSet();
    expect(tiles).toHaveLength(28);
    const ids = new Set(tiles.map((t) => t.id));
    expect(ids.size).toBe(28);
    for (const t of tiles) {
      expect(t.low).toBeLessThanOrEqual(t.high);
      expect(t.high).toBeLessThanOrEqual(6);
    }
  });
});

describe('shuffleTiles / commitments', () => {
  const deck = createDoubleSixSet();

  it('is deterministic for the same seed', () => {
    expect(shuffleTiles(deck, 'seed-a')).toEqual(shuffleTiles(deck, 'seed-a'));
  });

  it('preserves the full set of tiles', () => {
    const shuffled = shuffleTiles(deck, 'seed-b');
    expect([...shuffled].sort((x, y) => x.id.localeCompare(y.id))).toEqual(
      [...deck].sort((x, y) => x.id.localeCompare(y.id)),
    );
  });

  it('produces different orders for different seeds', () => {
    expect(shuffleTiles(deck, 'seed-a')).not.toEqual(shuffleTiles(deck, 'seed-c'));
  });

  it('commits to a shuffle order deterministically', () => {
    const order = shuffleTiles(deck, 'seed-a');
    const c1 = commitShuffle(order, 'nonce-1');
    const c2 = commitShuffle(order, 'nonce-1');
    const c3 = commitShuffle(order, 'nonce-2');
    expect(c1).toBe(c2);
    expect(c1).not.toBe(c3);
    expect(fnv1a('domino')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('deal', () => {
  it('deals handSize tiles per player and boneyards the rest', () => {
    const result = deal(PLAYERS, 'deal-seed', 6);
    // Hands + boneyard + the tile committed to the chain = the full set.
    const total =
      result.hands.reduce((n, h) => n + h.length, 0) +
      result.boneyard.length +
      result.chain.tiles.length;
    expect(total).toBe(28);
    expect(result.boneyard).toHaveLength(28 - 6 * PLAYERS.length);
  });

  it('removes the opening tile from the opener hand', () => {
    const result = deal(PLAYERS, 'deal-seed', 6);
    const opening = result.chain.tiles[0];
    expect(opening).toBeDefined();
    const openerHand = result.hands[0] ?? [];
    expect(openerHand.some((t) => t.id === opening?.id)).toBe(false);
  });

  it('seeds the chain with exactly the opening tile', () => {
    const result = deal(PLAYERS, 'deal-seed', 6);
    expect(result.chain.tiles).toHaveLength(1);
    const opening = result.chain.tiles[0]!;
    expect(result.chain.leftEnd).toBe(opening.low);
    expect(result.chain.rightEnd).toBe(opening.high);
  });
});

describe('legalMoves', () => {
  const chain: Chain = { tiles: [], leftEnd: 3, rightEnd: 5 };

  it('matches a tile against either end regardless of orientation', () => {
    const moves = legalMoves([{ id: '3-4', low: 3, high: 4 }], chain, 'block');
    expect(moves).toEqual([{ tile: { id: '3-4', low: 3, high: 4 }, end: 'left' }]);
    const flipped = legalMoves([{ id: '0-5', low: 0, high: 5 }], chain, 'block');
    expect(flipped).toEqual([{ tile: { id: '0-5', low: 0, high: 5 }, end: 'right' }]);
  });

  it('returns no moves for an unrelated hand', () => {
    expect(legalMoves([{ id: '0-1', low: 0, high: 1 }], chain, 'block')).toHaveLength(0);
    expect(hasLegalMove([{ id: '0-1', low: 0, high: 1 }], chain, 'block')).toBe(false);
    expect(hasLegalMove([{ id: '1-3', low: 1, high: 3 }], chain, 'block')).toBe(true);
  });

  it('offers both ends when a double matches', () => {
    const both: Chain = { tiles: [], leftEnd: 4, rightEnd: 4 };
    const moves = legalMoves([{ id: '4-4', low: 4, high: 4 }], both, 'block');
    expect(moves.map((m) => m.end).sort()).toEqual(['left', 'right']);
  });
});

describe('playTile', () => {
  it('plays on the left and updates the open end', () => {
    const chain: Chain = { tiles: [], leftEnd: 3, rightEnd: 5 };
    const next = playTile(chain, { id: '3-4', low: 3, high: 4 }, 'left', 'block');
    expect(next.leftEnd).toBe(4);
    expect(next.rightEnd).toBe(5);
    expect(next.tiles).toHaveLength(1);
  });

  it('plays on the right and updates the open end', () => {
    const chain: Chain = { tiles: [], leftEnd: 3, rightEnd: 5 };
    const next = playTile(chain, { id: '5-6', low: 5, high: 6 }, 'right', 'block');
    expect(next.leftEnd).toBe(3);
    expect(next.rightEnd).toBe(6);
    expect(next.tiles).toHaveLength(1);
  });

  it('rejects an illegal placement', () => {
    const chain: Chain = { tiles: [], leftEnd: 3, rightEnd: 5 };
    expect(() => playTile(chain, { id: '0-1', low: 0, high: 1 }, 'left', 'block')).toThrow(
      /Illegal move/,
    );
  });
});

describe('drawFromBoneyard', () => {
  it('draws the top tile and reports an empty boneyard', () => {
    const tile = { id: '0-0', low: 0, high: 0 };
    expect(drawFromBoneyard([tile])).toEqual(tile);
    expect(drawFromBoneyard([])).toBeNull();
  });
});

describe('scoreHand', () => {
  const players: PlayerState[] = [
    { id: 'p0', name: 'Ana', hand: [], score: 0, seated: true },
    { id: 'p1', name: 'Bo', hand: [{ id: '6-6', low: 6, high: 6 }], score: 0, seated: true },
    { id: 'p2', name: 'Cy', hand: [{ id: '1-2', low: 1, high: 2 }], score: 0, seated: true },
  ];

  it('awards one point per hand in Block', () => {
    expect(scoreHand(players, 'p0', 'block')).toEqual({ p0: 1, p1: 0, p2: 0 });
  });

  it('awards the pip total in All Fives', () => {
    expect(scoreHand(players, 'p0', 'all-fives')).toEqual({ p0: 15, p1: 0, p2: 0 });
  });
});

describe('createInitialState', () => {
  it('builds a consistent initial state', () => {
    const state = createInitialState(PLAYERS, 'block', 'init-seed', 6);
    expect(state.phase).toBe('awaiting-play');
    expect(state.variant).toBe('block');
    expect(state.currentPlayer).toBe('p0');
    expect(state.players.map((p) => p.id)).toEqual(['p0', 'p1']);
    const total =
      state.players.reduce((n, p) => n + p.hand.length, 0) +
      state.boneyard.length +
      state.chain.tiles.length;
    expect(total).toBe(28);
    expect(state.winner).toBeNull();
  });
});

describe('tilePips', () => {
  it('counts a double twice', () => {
    expect(tilePips({ id: '6-6', low: 6, high: 6 })).toBe(12);
    expect(tilePips({ id: '1-2', low: 1, high: 2 })).toBe(3);
  });
});

