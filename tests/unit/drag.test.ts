import { describe, expect, it } from 'vitest';
import {
  chainEnds,
  legalEndsFor,
  previewSlot,
  resolveSnap,
  SNAP_DISTANCE,
} from '../../shared/drag.js';
import type { Chain, PlacedTile, Tile } from '../../shared/types.js';

function placed(id: string, left: number, right: number): PlacedTile {
  const [low, high] = id.split('-').map(Number);
  return { id, low: low ?? 0, high: high ?? 0, left, right };
}

function chainOf(tiles: PlacedTile[]): Chain {
  return {
    tiles,
    leftEnd: tiles[0]?.left ?? 0,
    rightEnd: tiles[tiles.length - 1]?.right ?? 0,
    spinner: null,
  };
}

const chain = chainOf([placed('3-4', 3, 4)]);

describe('chainEnds', () => {
  it('puts the open ends either side of the chain', () => {
    const ends = chainEnds(chain);
    expect(ends.map((e) => e.end)).toEqual(['left', 'right']);
    expect(ends[0]!.x).toBeLessThan(ends[1]!.x);
    expect(ends[0]!.pip).toBe(3);
    expect(ends[1]!.pip).toBe(4);
  });

  it('returns a single end for an empty chain', () => {
    const ends = chainEnds(chainOf([]));
    expect(ends).toHaveLength(1);
    expect(ends[0]!.x).toBe(0);
  });
});

describe('legalEndsFor', () => {
  it('finds the end a tile can join', () => {
    const tile: Tile = { id: 't', low: 4, high: 6 };
    expect(legalEndsFor(tile, chain)).toEqual(['right']);
  });

  it('allows a tile that matches both ends', () => {
    const tile: Tile = { id: 't', low: 3, high: 4 };
    expect(legalEndsFor(tile, chain)).toEqual(['left', 'right']);
  });

  it('rejects a tile that matches neither end', () => {
    const tile: Tile = { id: 't', low: 0, high: 1 };
    expect(legalEndsFor(tile, chain)).toEqual([]);
  });
});

describe('resolveSnap', () => {
  it('does not snap when the pointer is far away', () => {
    const result = resolveSnap({ id: 't', low: 3, high: 4 }, chain, { x: 500, y: 500 });
    expect(result.snapped).toBe(false);
    expect(result.end).toBeNull();
    expect(result.x).toBe(500);
  });

  it('snaps to the right end and matches the pip', () => {
    const ends = chainEnds(chain);
    const right = ends[1]!;
    const result = resolveSnap(
      { id: 't', low: 4, high: 6 },
      chain,
      { x: right.x, y: right.y },
      { legalEnds: ['right'] },
    );
    expect(result.snapped).toBe(true);
    expect(result.end).toBe('right');
    expect(result.x).toBe(right.x);
  });

  it('flips the tile so the matching half faces the chain', () => {
    const ends = chainEnds(chain);
    const right = ends[1]!;
    const matching = resolveSnap({ id: 't', low: 4, high: 6 }, chain, { x: right.x, y: right.y });
    const notMatching = resolveSnap({ id: 't', low: 6, high: 9 }, chain, {
      x: right.x,
      y: right.y,
    });
    expect(matching.rotation).not.toBe(notMatching.rotation);
  });

  it('lays a double across the chain', () => {
    const ends = chainEnds(chain);
    const result = resolveSnap({ id: 't', low: 4, high: 4 }, chain, {
      x: ends[1]!.x,
      y: ends[1]!.y,
    });
    expect(result.rotation).toBe(90);
    expect(result.vertical).toBe(true);
  });

  it('only counts a snap as legal when the end is legal', () => {
    const ends = chainEnds(chain);
    const result = resolveSnap(
      { id: 't', low: 4, high: 6 },
      chain,
      { x: ends[1]!.x, y: ends[1]!.y },
      { legalEnds: ['left'] },
    );
    expect(result.snapped).toBe(false);
  });

  it('ignores a pointer just outside the snap distance', () => {
    const ends = chainEnds(chain);
    const result = resolveSnap({ id: 't', low: 4, high: 6 }, chain, {
      x: ends[1]!.x + SNAP_DISTANCE + 5,
      y: ends[1]!.y,
    });
    expect(result.snapped).toBe(false);
  });
});

describe('previewSlot', () => {
  it('orients the tile so the matching half meets the chain', () => {
    const slot = previewSlot(chain, { id: 't', low: 4, high: 6 }, 'right');
    // The chain's right end shows 4, so the tile's 4 must face the chain.
    expect(slot.tile.left).toBe(4);
    expect(slot.tile.right).toBe(6);
  });

  it('places the tile at the chosen end', () => {
    const ends = chainEnds(chain);
    const slot = previewSlot(chain, { id: 't', low: 4, high: 6 }, 'left');
    expect(slot.x).toBe(ends[0]!.x);
  });
});
