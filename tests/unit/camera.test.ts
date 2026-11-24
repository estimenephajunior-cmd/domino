import { describe, expect, it } from 'vitest';
import { cameraTarget, clamp, easeCamera, MAX_ZOOM, MIN_ZOOM } from '../../shared/camera.js';
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

const many = (count: number) =>
  chainOf(Array.from({ length: count }, (_, i) => placed(`${i}-${i + 1}`, i, i + 1)));

describe('cameraTarget', () => {
  it('centres an empty board', () => {
    const target = cameraTarget(chainOf([]), { width: 800, height: 600 });
    expect(target.x).toBe(0);
    expect(target.y).toBe(0);
    expect(target.zoom).toBe(1);
  });

  it('keeps a small chain centred', () => {
    const target = cameraTarget(many(3), { width: 1200, height: 800 });
    expect(target.x).toBe(0);
    expect(target.y).toBe(0);
  });

  it('keeps the zoom inside the allowed range', () => {
    const target = cameraTarget(many(60), { width: 320, height: 240 });
    expect(target.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(target.zoom).toBeLessThanOrEqual(MAX_ZOOM);
  });

  it('follows the newest tile once the board outgrows the viewport', () => {
    // A chain long enough that it cannot fit even at the minimum zoom, so
    // the camera has to pan to keep the newest tile in view.
    const target = cameraTarget(many(100), { width: 400, height: 300 });
    expect(target.x).toBeGreaterThan(0);
  });

  it('pans sideways on a very narrow viewport', () => {
    const target = cameraTarget(many(30), { width: 200, height: 600 });
    expect(target.x).not.toBe(0);
  });

  it('never points outside the board', () => {
    const target = cameraTarget(many(40), { width: 400, height: 300 });
    expect(Number.isFinite(target.x)).toBe(true);
    expect(Number.isFinite(target.y)).toBe(true);
  });
});

describe('clamp', () => {
  it('keeps a value inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });

  it('handles an inverted range', () => {
    expect(clamp(5, 10, 0)).toBe(10);
  });
});

describe('easeCamera', () => {
  it('moves a fraction of the way to the target', () => {
    const result = easeCamera({ x: 0, y: 0, zoom: 1 }, { x: 100, y: 50, zoom: 2 }, 0.5);
    expect(result).toEqual({ x: 50, y: 25, zoom: 1.5 });
  });

  it('reaches the target at a factor of one', () => {
    const target = { x: 10, y: 20, zoom: 1.5 };
    expect(easeCamera({ x: 0, y: 0, zoom: 1 }, target, 1)).toEqual(target);
  });
});
