import { describe, expect, it } from 'vitest';
import {
  commitShuffle,
  createDoubleNineSet,
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
import { commitShuffleSha256, verifyShuffleSha256 } from '../../shared/fairness.js';
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

describe('deal order / hand ownership', () => {
  it('maps each legacy automatic hand to its owning player id', () => {
    const result = deal(PLAYERS, 'deal-seed', 6);
    expect([...result.order].sort()).toEqual(['p0', 'p1']);
    expect(result.hands).toHaveLength(2);
  });

  it('keeps seats stable and advances past the automatically played opener', () => {
    // Find a deal where the opening seat is NOT the first input seat.
    const rotated = Array.from({ length: 64 }, (_, n) => deal(PLAYERS, `opener-${n}`, 6)).find(
      (d) => d.order[0] !== PLAYERS[0]?.id,
    );
    expect(rotated).toBeDefined();
    if (!rotated) return;
    const state = createInitialState(PLAYERS, 'block', rotated.seed, 6);

    // Seats never move; only the turn does.
    expect(state.players.map((p) => p.id)).toEqual(['p0', 'p1']);
    expect(state.currentPlayer).toBe(PLAYERS[0]?.id);
    expect(state.phase).toBe('mixing');
    expect(state.chain.tiles).toHaveLength(0);
    expect(state.dealSlots).toHaveLength(28);
  });
});

describe('legalMoves', () => {
  const chain: Chain = { tiles: [], leftEnd: 3, rightEnd: 5, spinner: null };

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
    const both: Chain = { tiles: [], leftEnd: 4, rightEnd: 4, spinner: null };
    const moves = legalMoves([{ id: '4-4', low: 4, high: 4 }], both, 'block');
    expect(moves.map((m) => m.end).sort()).toEqual(['left', 'right']);
  });
});

describe('playTile', () => {
  it('plays on the left and updates the open end', () => {
    const chain: Chain = { tiles: [], leftEnd: 3, rightEnd: 5, spinner: null };
    const next = playTile(chain, { id: '3-4', low: 3, high: 4 }, 'left', 'block');
    expect(next.leftEnd).toBe(4);
    expect(next.rightEnd).toBe(5);
    expect(next.tiles).toHaveLength(1);
  });

  it('plays on the right and updates the open end', () => {
    const chain: Chain = { tiles: [], leftEnd: 3, rightEnd: 5, spinner: null };
    const next = playTile(chain, { id: '5-6', low: 5, high: 6 }, 'right', 'block');
    expect(next.leftEnd).toBe(3);
    expect(next.rightEnd).toBe(6);
    expect(next.tiles).toHaveLength(1);
  });

  it('rejects an illegal placement', () => {
    const chain: Chain = { tiles: [], leftEnd: 3, rightEnd: 5, spinner: null };
    expect(() => playTile(chain, { id: '0-1', low: 0, high: 1 }, 'left', 'block')).toThrow(
      /Illegal move/,
    );
  });

  it('keeps tiles in board order, left to right', () => {
    let chain: Chain = { tiles: [], leftEnd: 3, rightEnd: 5, spinner: null };
    chain = playTile(chain, { id: '3-4', low: 3, high: 4 }, 'left', 'block');
    chain = playTile(chain, { id: '5-6', low: 5, high: 6 }, 'right', 'block');
    chain = playTile(chain, { id: '2-4', low: 2, high: 4 }, 'left', 'block');
    // Board order runs left → right: 2-4 was added at the left end.
    expect(chain.tiles.map((t) => t.id)).toEqual(['2-4', '3-4', '5-6']);
  });

  it('orients each tile so its matching half faces the chain', () => {
    let chain: Chain = { tiles: [], leftEnd: 3, rightEnd: 5, spinner: null };
    chain = playTile(chain, { id: '3-4', low: 3, high: 4 }, 'left', 'block');
    // Played on the left: 3 matched the open end, so 3 faces right and 4 is
    // the new open left end.
    expect(chain.tiles[0]).toMatchObject({ left: 4, right: 3 });
    expect(chain.leftEnd).toBe(4);

    chain = playTile(chain, { id: '5-6', low: 5, high: 6 }, 'right', 'block');
    // Played on the right: 5 matched the open end, so 5 faces left.
    expect(chain.tiles[1]).toMatchObject({ left: 5, right: 6 });
    expect(chain.rightEnd).toBe(6);
  });

  it('keeps every adjacent pair matching along the board', () => {
    // Start from a realistic board: the opening tile lies on the chain.
    let chain: Chain = {
      tiles: [{ id: '3-5', low: 3, high: 5, left: 3, right: 5 }],
      leftEnd: 3,
      rightEnd: 5,
      spinner: null,
    };
    chain = playTile(chain, { id: '3-4', low: 3, high: 4 }, 'left', 'block');
    chain = playTile(chain, { id: '5-6', low: 5, high: 6 }, 'right', 'block');
    chain = playTile(chain, { id: '2-4', low: 2, high: 4 }, 'left', 'block');
    chain = playTile(chain, { id: '6-1', low: 1, high: 6 }, 'right', 'block');
    const tiles = chain.tiles;
    for (let i = 0; i < tiles.length - 1; i++) {
      expect(tiles[i]!.right).toBe(tiles[i + 1]!.left);
    }
    expect(tiles[0]!.left).toBe(chain.leftEnd);
    expect(tiles[tiles.length - 1]!.right).toBe(chain.rightEnd);
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
    expect(state.phase).toBe('mixing');
    expect(state.variant).toBe('block');
    expect(state.currentPlayer).toBe('p0');
    expect(state.players.map((p) => p.id)).toEqual(['p0', 'p1']);
    expect(state.players.every((player) => player.hand.length === 0)).toBe(true);
    expect(state.dealSlots).toHaveLength(28);
    expect(state.winner).toBeNull();
  });
});

describe('tilePips', () => {
  it('counts a double twice', () => {
    expect(tilePips({ id: '6-6', low: 6, high: 6 })).toBe(12);
    expect(tilePips({ id: '1-2', low: 1, high: 2 })).toBe(3);
  });
});

describe('double-nine set', () => {
  it('creates 55 unique tiles up to 9-9', () => {
    const tiles = createDoubleNineSet();
    expect(tiles).toHaveLength(55);
    const ids = new Set(tiles.map((t) => t.id));
    expect(ids.size).toBe(55);
    expect(tiles.some((t) => t.id === '9-9')).toBe(true);
    expect(tiles.some((t) => t.id === '7-8')).toBe(true);
  });

  it('deals a 55-tile set for Caribbean', () => {
    const state = createInitialState(PLAYERS, 'caribbean', 'd9-seed', 7);
    expect(state.dealSlots).toHaveLength(55);
    expect(state.boneyard).toHaveLength(0);
  });
});

describe('spinner', () => {
  it('starts empty before a player chooses the opening tile', () => {
    const state = createInitialState(PLAYERS, 'all-fives', 'spin', 7);
    expect(state.chain.tiles).toHaveLength(0);
    expect(state.chain.spinner).toBeNull();
  });

  it('stays null in block (linear) variants even for doubles', () => {
    const state = createInitialState(PLAYERS, 'block', 'spin-block', 6);
    expect(state.chain.spinner).toBeNull();
  });

  it('captures the first played double in a doubles-cross variant', () => {
    const start: Chain = { tiles: [], leftEnd: 4, rightEnd: 4, spinner: null };
    const next = playTile(start, { id: '4-4', low: 4, high: 4 }, 'left', 'all-fives');
    expect(next.spinner).toEqual({ id: '4-4', low: 4, high: 4 });
    // A later double does not replace the spinner.
    const later = playTile(next, { id: '4-2', low: 2, high: 4 }, 'left', 'all-fives');
    const third = playTile(later, { id: '2-2', low: 2, high: 2 }, 'left', 'all-fives');
    expect(third.spinner).toEqual({ id: '4-4', low: 4, high: 4 });
  });
});

describe('partnership scoring (Latin)', () => {
  const TEAM: PlayerState[] = [
    { id: 'p0', name: 'Ana', hand: [], score: 0, seated: true },
    { id: 'p1', name: 'Bo', hand: [{ id: '6-6', low: 6, high: 6 }], score: 0, seated: true },
    { id: 'p2', name: 'Cy', hand: [{ id: '1-2', low: 1, high: 2 }], score: 0, seated: true },
    { id: 'p3', name: 'Di', hand: [{ id: '3-3', low: 3, high: 3 }], score: 0, seated: true },
  ];

  it("awards the losing team's pip total to both partners", () => {
    // p0 (seat 0) goes out; partners are seats 0 and 2. Losers: p1 (12) + p3 (6) = 18.
    const deltas = scoreHand(TEAM, 'p0', 'latin');
    expect(deltas).toEqual({ p0: 18, p1: 0, p2: 18, p3: 0 });
  });

  it('settles per team across the aisle', () => {
    // p1 (seat 1) goes out; partner is seat 3. Losers: p0 (0) + p2 (3) = 3.
    const deltas = scoreHand(TEAM, 'p1', 'latin');
    expect(deltas).toEqual({ p0: 0, p1: 3, p2: 0, p3: 3 });
  });

  it('still scores solo for non-partnership variants', () => {
    const deltas = scoreHand(TEAM.slice(0, 3) as PlayerState[], 'p0', 'all-fives');
    expect(deltas).toEqual({ p0: 15, p1: 0, p2: 0 });
  });
});

describe('SHA-256 fairness commitments', () => {
  it('commits and verifies a shuffled order', async () => {
    const order = shuffleTiles(createDoubleSixSet(), 'fair-seed');
    const commitment = await commitShuffleSha256(order, 'nonce-1');
    expect(commitment).toMatch(/^[0-9a-f]{64}$/);
    await expect(verifyShuffleSha256(order, 'nonce-1', commitment)).resolves.toBe(true);
  });

  it('rejects a tampered order or nonce', async () => {
    const order = shuffleTiles(createDoubleSixSet(), 'fair-seed');
    const commitment = await commitShuffleSha256(order, 'nonce-1');
    const tampered = [...order];
    [tampered[0], tampered[1]] = [tampered[1]!, tampered[0]!];
    await expect(verifyShuffleSha256(tampered, 'nonce-1', commitment)).resolves.toBe(false);
    await expect(verifyShuffleSha256(order, 'nonce-2', commitment)).resolves.toBe(false);
  });
});
