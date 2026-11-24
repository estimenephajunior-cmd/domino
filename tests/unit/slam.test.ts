import { describe, expect, it } from 'vitest';
import {
  isDoubleTile,
  judgeSlam,
  recoilImpulse,
  shakeOffset,
  SLAM_DURATION_MS,
  SLAM_VELOCITY_THRESHOLD,
} from '../../shared/slam.js';
import type { PlacedTile } from '../../shared/types.js';

describe('judgeSlam', () => {
  it('does nothing for a gentle placement', () => {
    const effect = judgeSlam({ velocity: 0.1, isDouble: false, isWinning: false });
    expect(effect.kind).toBe('none');
    expect(effect.intensity).toBe(0);
    expect(effect.vibrate).toBe(false);
  });

  it('slam a thrown tile', () => {
    const effect = judgeSlam({
      velocity: SLAM_VELOCITY_THRESHOLD + 0.5,
      isDouble: false,
      isWinning: false,
    });
    expect(effect.kind).toBe('normal');
    expect(effect.intensity).toBeGreaterThan(0);
    expect(effect.recoil).toBeGreaterThan(0);
  });

  it('slam a double, harder when thrown', () => {
    const gentle = judgeSlam({ velocity: 0.1, isDouble: true, isWinning: false });
    const thrown = judgeSlam({ velocity: 3, isDouble: true, isWinning: false });
    expect(gentle.kind).toBe('double');
    expect(thrown.kind).toBe('double');
    expect(thrown.intensity).toBeGreaterThan(gentle.intensity);
    expect(thrown.recoil).toBeGreaterThan(gentle.recoil);
  });

  it('gives a winning tile the heaviest slam', () => {
    const effect = judgeSlam({ velocity: 0.1, isDouble: false, isWinning: true });
    expect(effect.kind).toBe('winning');
    expect(effect.intensity).toBe(1);
  });
});

describe('shakeOffset', () => {
  const effect = judgeSlam({ velocity: 3, isDouble: false, isWinning: false });

  it('is still before and after the window', () => {
    expect(shakeOffset(effect, -10)).toEqual({ x: 0, y: 0 });
    expect(shakeOffset(effect, SLAM_DURATION_MS + 10)).toEqual({ x: 0, y: 0 });
  });

  it('moves the screen during the window', () => {
    const offset = shakeOffset(effect, 50);
    expect(Math.hypot(offset.x, offset.y)).toBeGreaterThan(0);
  });

  it('decays towards the end of the window', () => {
    const start = Math.hypot(...Object.values(shakeOffset(effect, 0)));
    const end = Math.hypot(...Object.values(shakeOffset(effect, SLAM_DURATION_MS - 1)));
    expect(end).toBeLessThan(start);
  });

  it('does not shake for a gentle placement', () => {
    const none = judgeSlam({ velocity: 0, isDouble: false, isWinning: false });
    expect(shakeOffset(none, 10)).toEqual({ x: 0, y: 0 });
  });
});

describe('recoilImpulse', () => {
  const effect = judgeSlam({ velocity: 3, isDouble: false, isWinning: false });
  const centre = { x: 0, y: 0 };

  it('pushes a nearby tile away from the impact', () => {
    const impulse = recoilImpulse(effect, centre, { x: 50, y: 0 }, 92);
    expect(impulse.x).toBeGreaterThan(0);
    expect(impulse.y).toBe(0);
  });

  it('leaves distant tiles alone', () => {
    const impulse = recoilImpulse(effect, centre, { x: 500, y: 0 }, 92);
    expect(impulse).toEqual({ x: 0, y: 0 });
  });

  it('does not move anything without a slam', () => {
    const none = judgeSlam({ velocity: 0, isDouble: false, isWinning: false });
    expect(recoilImpulse(none, centre, { x: 50, y: 0 }, 92)).toEqual({ x: 0, y: 0 });
  });
});

describe('isDoubleTile', () => {
  it('detects a double', () => {
    const tile: PlacedTile = { id: 't', low: 4, high: 4, left: 4, right: 4 };
    expect(isDoubleTile(tile)).toBe(true);
  });

  it('rejects a normal tile', () => {
    const tile: PlacedTile = { id: 't', low: 4, high: 5, left: 4, right: 5 };
    expect(isDoubleTile(tile)).toBe(false);
  });
});
