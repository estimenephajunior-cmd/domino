import { describe, expect, it } from 'vitest';
import {
  boardSize,
  layoutChain,
  TILE_WIDTH,
  TILES_PER_ROW,
  tileFootprint,
  tilesPerRowForWidth,
} from '../../shared/board.js';
import type { Chain, PlacedTile } from '../../shared/types.js';

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

describe('layoutChain', () => {
  it('lays tiles out in board order', () => {
    const slots = layoutChain(chainOf([placed('1-2', 1, 2), placed('2-3', 2, 3)]));
    expect(slots.map((s) => s.tile.id)).toEqual(['1-2', '2-3']);
    expect(slots.map((s) => s.index)).toEqual([0, 1]);
  });

  it('centres the row on the origin', () => {
    const slots = layoutChain(chainOf([placed('1-2', 1, 2), placed('2-3', 2, 3)]));
    const midX = (slots[0]!.x + slots[1]!.x) / 2;
    expect(midX).toBe(0);
  });

  it('snakes alternate rows in the opposite direction', () => {
    const tiles = Array.from({ length: TILES_PER_ROW + 2 }, (_, i) =>
      placed(`${i}-${i + 1}`, i, i + 1),
    );
    tiles[TILES_PER_ROW - 2] = placed('4-4', 4, 4);
    const slots = layoutChain(chainOf(tiles));
    // Row 0 runs left → right, so x increases.
    expect(slots[1]!.x).toBeGreaterThan(slots[0]!.x);
    // Row 1 runs right → left, so x decreases again.
    expect(slots[TILES_PER_ROW]!.x).toBeLessThan(slots[TILES_PER_ROW - 1]!.x);
    // The second row sits below the first.
    expect(slots[TILES_PER_ROW - 1]!.y).toBeGreaterThan(slots[0]!.y);
  });

  it('turns doubles across the chain', () => {
    const slots = layoutChain(chainOf([placed('3-3', 3, 3), placed('3-4', 3, 4)]));
    expect(slots[0]!.vertical).toBe(true);
    expect(slots[1]!.vertical).toBe(false);
  });

  it('keeps every straight neighbour physically edge-to-edge, including doubles', () => {
    const slots = layoutChain(
      chainOf([
        placed('1-2', 1, 2),
        placed('2-2', 2, 2),
        placed('2-4', 2, 4),
        placed('4-5', 4, 5),
      ]),
      { tilesPerRow: 8 },
    );
    for (let index = 1; index < slots.length; index += 1) {
      const previous = slots[index - 1]!;
      const current = slots[index]!;
      expect(current.x - previous.x).toBe((previous.width + current.width) / 2);
      expect(current.y).toBe(previous.y);
    }
  });

  it('turns only through a double and keeps ordinary tiles horizontal', () => {
    const slots = layoutChain(
      chainOf([
        placed('1-2', 1, 2),
        placed('2-3', 2, 3),
        placed('3-3', 3, 3),
        placed('3-4', 3, 4),
        placed('4-5', 4, 5),
      ]),
      { tilesPerRow: 3 },
    );
    const anchor = slots[2]!;
    const firstAfterTurn = slots[3]!;
    expect(anchor.vertical).toBe(true);
    expect(firstAfterTurn.vertical).toBe(false);
    expect(firstAfterTurn.rotation).toBe(180);
    expect(firstAfterTurn.x).toBe(anchor.x - TILE_WIDTH / 4);
    expect(firstAfterTurn.y - anchor.y).toBe((anchor.height + firstAfterTurn.height) / 2);
    expect(
      slots.filter((slot) => slot.tile.low !== slot.tile.high).every((slot) => !slot.vertical),
    ).toBe(true);
  });

  it('handles an empty chain', () => {
    expect(layoutChain(chainOf([]))).toHaveLength(0);
    expect(boardSize(chainOf([]))).toEqual({ width: 92, height: 44 });
  });

  it('keeps a long double-anchored chain free of overlapping bodies', () => {
    const tiles = Array.from({ length: 28 }, (_, index) =>
      index % 5 === 4
        ? placed(`${index % 7}-${index % 7}`, index % 7, index % 7)
        : placed(`${index}-${index + 1}`, index % 7, (index + 1) % 7),
    );
    const slots = layoutChain(chainOf(tiles), { tilesPerRow: 5 });
    expect(slots.filter((slot) => slot.tile.low !== slot.tile.high).every((slot) => !slot.vertical))
      .toBe(true);
    for (let left = 0; left < slots.length; left += 1) {
      for (let right = left + 2; right < slots.length; right += 1) {
        const one = slots[left]!;
        const two = slots[right]!;
        expect(
          Math.abs(one.x - two.x) >= (one.width + two.width) / 2
            || Math.abs(one.y - two.y) >= (one.height + two.height) / 2,
        ).toBe(true);
      }
    }
  });
});

describe('viewport-aware layout', () => {
  it('snakes at the requested row capacity', () => {
    const tiles = [
      placed('0-1', 0, 1),
      placed('1-1', 1, 1),
      placed('1-2', 1, 2),
      placed('2-2', 2, 2),
      placed('2-3', 2, 3),
    ];
    const slots = layoutChain(chainOf(tiles), { tilesPerRow: 2 });
    // Three rows for five tiles at two per row.
    expect(new Set(slots.map((s) => s.y)).size).toBe(3);
  });

  it('reports each tile footprint, swapping it for a double', () => {
    const slots = layoutChain(chainOf([placed('3-3', 3, 3), placed('3-4', 3, 4)]));
    expect(slots[0]!.width).toBe(44);
    expect(slots[0]!.height).toBe(92);
    expect(slots[1]!.width).toBe(92);
    expect(slots[1]!.height).toBe(44);
  });

  it('sizes the board around the real footprints', () => {
    const size = boardSize(chainOf([placed('1-2', 1, 2)]));
    expect(size).toEqual({ width: 92, height: 44 });
  });

  it('fits more tiles per row on a wider viewport', () => {
    const narrow = tilesPerRowForWidth(400);
    const wide = tilesPerRowForWidth(1200);
    expect(narrow).toBeLessThan(wide);
    expect(wide).toBeGreaterThanOrEqual(1);
  });

  it('keeps at least five tiles in a mobile run and lets the camera fit them', () => {
    expect(tilesPerRowForWidth(10)).toBe(5);
  });

  it('exposes the footprint of a laid tile', () => {
    expect(tileFootprint(false)).toEqual({ width: 92, height: 44 });
    expect(tileFootprint(true)).toEqual({ width: 44, height: 92 });
  });
});
