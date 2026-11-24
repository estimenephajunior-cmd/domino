/**
 * Camera framing for the auto-snaking board.
 *
 * Pure geometry: given the laid-out chain and the viewport, work out where
 * the camera should look and how far it should zoom. The renderer eases
 * towards this target every frame, so the camera never snaps.
 */
import { boardSize, layoutChain, type LayoutOptions } from './board.js';
import type { Chain } from './types.js';

/** The camera's view of the board. */
export interface CameraState {
  /** Centre of the view, in board coordinates. */
  readonly x: number;
  readonly y: number;
  /** Zoom factor: 1 means the board is drawn at its natural size. */
  readonly zoom: number;
}

/** A viewport in CSS pixels. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** The camera never zooms below this, so tiles stay legible. */
export const MIN_ZOOM = 0.35;

/** The camera never zooms past this, even on a tiny viewport. */
export const MAX_ZOOM = 1.25;

/** Padding kept between the board and the viewport edge, in board units. */
export const CAMERA_PADDING = 24;

/**
 * Work out the camera target for a chain.
 *
 * The board is centred until it outgrows the viewport; from then on the
 * camera follows the end of the chain that just grew, which is the tile the
 * player is watching.
 */
export function cameraTarget(
  chain: Chain,
  viewport: Viewport,
  options: LayoutOptions = {},
  focusTileId?: string,
): CameraState {
  const slots = layoutChain(chain, options);
  const size = boardSize(chain, options);
  if (slots.length === 0) {
    return { x: 0, y: 0, zoom: 1 };
  }

  const usableWidth = Math.max(1, viewport.width - CAMERA_PADDING * 2);
  const usableHeight = Math.max(1, viewport.height - CAMERA_PADDING * 2);

  // Fit the whole board when it is small enough; otherwise zoom to the
  // available area so the board scrolls rather than shrinking to nothing.
  const zoom = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, Math.min(usableWidth / size.width, usableHeight / size.height)),
  );

  // The board's natural extent is centred on the origin, so the camera starts
  // there and only drifts once the chain runs past the viewport.
  const halfWidth = usableWidth / zoom / 2;
  const halfHeight = usableHeight / zoom / 2;
  const boardHalfWidth = size.width / 2;
  const boardHalfHeight = size.height / 2;

  // The newest tile is the one the player is watching; it sits at the end of
  // the chain, which is the right-most tile of the last row.
  const last = slots.find((slot) => slot.tile.id === focusTileId) ?? slots[slots.length - 1]!;

  // While the whole board fits, the camera stays centred on it. Once the
  // board outgrows the viewport, the camera follows the newest tile, which
  // is the one the player just watched being placed.
  const overflowsX = boardHalfWidth > halfWidth;
  const overflowsY = boardHalfHeight > halfHeight;
  const focusX = overflowsX ? last.x : 0;
  const focusY = overflowsY ? last.y : 0;

  // The camera may not wander beyond the board's own edges (plus the padding
  // that keeps a full row of tiles visible).
  const maxX = Math.max(0, boardHalfWidth - halfWidth) + CAMERA_PADDING;
  const maxY = Math.max(0, boardHalfHeight - halfHeight) + CAMERA_PADDING;

  return {
    x: clamp(focusX, -maxX, maxX),
    y: clamp(focusY, -maxY, maxY),
    zoom,
  };
}

/** Keep a number inside a range. */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Ease the camera towards its target.
 *
 * The step is a fraction of the remaining distance, so the movement is
 * frame-rate independent and always decelerates into the target.
 */
export function easeCamera(current: CameraState, target: CameraState, factor: number): CameraState {
  const t = clamp(factor, 0, 1);
  return {
    x: current.x + (target.x - current.x) * t,
    y: current.y + (target.y - current.y) * t,
    zoom: current.zoom + (target.zoom - current.zoom) * t,
  };
}
