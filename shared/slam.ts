/**
 * Slam Play: the heavy impact effect when a tile is thrown down.
 *
 * The decision logic is pure so it can be unit tested; the actual screen
 * shake, haptic pulse and neighbour recoil are applied by the renderer.
 */
import type { PlacedTile } from './types.js';

/** How long the screen shake lasts, in milliseconds. */
export const SLAM_DURATION_MS = 250;

/** The haptic pattern used for a slam. */
export const SLAM_VIBRATION = [120, 40, 180] as const;

/** A release faster than this (px/ms) counts as a throw. */
export const SLAM_VELOCITY_THRESHOLD = 1.2;

/** What kind of impact a placement produced. */
export type SlamKind = 'none' | 'normal' | 'double' | 'winning';

/** The inputs used to judge a slam. */
export interface SlamInput {
  /** Release speed of the drag, in pixels per millisecond. */
  readonly velocity: number;
  /** True when the played tile is a double. */
  readonly isDouble: boolean;
  /** True when the placement ended the hand. */
  readonly isWinning: boolean;
}

/** The resolved slam effect. */
export interface SlamEffect {
  readonly kind: SlamKind;
  /** How hard the screen shakes, 0 to 1. */
  readonly intensity: number;
  /** Whether the device should vibrate. */
  readonly vibrate: boolean;
  /** How hard the neighbouring tiles recoil, 0 to 1. */
  readonly recoil: number;
}

/**
 * Judge a placement.
 *
 * A throw, a double or a winning tile each earn a slam; a double that was
 * thrown down hard is the heaviest kind of slam there is.
 */
export function judgeSlam(input: SlamInput): SlamEffect {
  const thrown = input.velocity >= SLAM_VELOCITY_THRESHOLD;

  if (input.isWinning) {
    return { kind: 'winning', intensity: 1, vibrate: true, recoil: 1 };
  }
  if (input.isDouble && thrown) {
    return { kind: 'double', intensity: 0.9, vibrate: true, recoil: 0.85 };
  }
  if (input.isDouble) {
    return { kind: 'double', intensity: 0.6, vibrate: true, recoil: 0.55 };
  }
  if (thrown) {
    return { kind: 'normal', intensity: 0.45, vibrate: true, recoil: 0.4 };
  }
  return { kind: 'none', intensity: 0, vibrate: false, recoil: 0 };
}

/**
 * The offset of the screen shake at a point in time.
 *
 * The shake is a damped oscillation that starts at full strength and dies
 * out at the end of the window, so it never ends on a jolt.
 */
export function shakeOffset(
  effect: SlamEffect,
  elapsedMs: number,
  seed = 1,
): { x: number; y: number } {
  if (effect.kind === 'none' || effect.intensity <= 0) return { x: 0, y: 0 };
  if (elapsedMs < 0 || elapsedMs > SLAM_DURATION_MS) return { x: 0, y: 0 };

  // Damped decay: strong at the start, zero at the end of the window.
  const progress = elapsedMs / SLAM_DURATION_MS;
  const decay = (1 - progress) ** 2;
  const amplitude = effect.intensity * 14 * decay;

  // Two out-of-phase sinusoids give a directionless rattle rather than a
  // single swinging line.
  const t = elapsedMs / 1000;
  const x = Math.sin(t * 47 + seed) * amplitude;
  const y = Math.cos(t * 61 + seed * 1.7) * amplitude;
  return { x, y };
}

/**
 * The impulse applied to the tiles around a slam.
 *
 * Neighbours are pushed away from the impact, so the board ripples outwards.
 */
export function recoilImpulse(
  effect: SlamEffect,
  centre: { x: number; y: number },
  neighbour: { x: number; y: number },
  tileWidth: number,
): { x: number; y: number } {
  if (effect.recoil <= 0) return { x: 0, y: 0 };
  const dx = neighbour.x - centre.x;
  const dy = neighbour.y - centre.y;
  const distance = Math.hypot(dx, dy);
  // Tiles beyond a couple of widths are not visibly affected.
  if (distance > tileWidth * 2.5 || distance === 0) return { x: 0, y: 0 };
  const falloff = 1 - distance / (tileWidth * 2.5);
  const strength = effect.recoil * falloff * tileWidth * 0.12;
  return { x: (dx / distance) * strength, y: (dy / distance) * strength };
}

/**
 * The browser's Vibration API, as far as this module needs it.
 *
 * Declared locally so the shared module also compiles for the server, which
 * has no DOM.
 */
interface VibrationCapable {
  readonly vibrate?: (pattern: number | number[]) => boolean;
}

/**
 * Fire the optional haptic pulse. The Vibration API is an enhancement only,
 * so a browser without it (or a denied permission) is not an error.
 */
export function vibrate(pattern: readonly number[] = SLAM_VIBRATION): void {
  if (typeof navigator === 'undefined') return;
  const vibration = (navigator as Navigator & VibrationCapable).vibrate;
  if (typeof vibration !== 'function') return;
  try {
    vibration.call(navigator, [...pattern]);
  } catch {
    // Some browsers throw when the page is not visible; ignore.
  }
}

/** Whether a placement was a double, from the placed tile. */
export function isDoubleTile(tile: PlacedTile): boolean {
  return tile.left === tile.right;
}
