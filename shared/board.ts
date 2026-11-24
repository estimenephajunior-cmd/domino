/**
 * Board geometry: where each tile sits on the felt.
 *
 * Pure and presentation-independent so the DOM renderer, the tests and any
 * future canvas/Pixi renderer all agree on one layout.
 */
import type { Chain, PlacedTile } from './types.js';

/** A laid-out tile: its board position and orientation. */
export interface BoardSlot {
  readonly tile: PlacedTile;
  readonly index: number;
  /** Pixel offset of the tile's centre from the board origin. */
  readonly x: number;
  readonly y: number;
  /** True when the tile is turned sideways (a double laid across the chain). */
  readonly vertical: boolean;
  /** Footprint of the tile on the felt, in board units. */
  readonly width: number;
  readonly height: number;
  /** Rotation of the canonical left-to-right tile, including bends and doubles. */
  readonly rotation?: number;
  /** Direction from the tile's first half towards its second half. */
  readonly direction?: number;
}

/** Tile footprint on the felt, in board units. */
export const TILE_WIDTH = 92;
export const TILE_HEIGHT = 44;

/** How many tiles fit in one row before the chain snakes onto the next. */
export const TILES_PER_ROW = 6;

/** Options for laying out the chain. */
export interface LayoutOptions {
  /** Tiles per row. Defaults to `TILES_PER_ROW`. */
  readonly tilesPerRow?: number;
  /** Footprint of a laid horizontal tile. */
  readonly tileWidth?: number;
  /** Footprint of a laid vertical (double) tile's short side. */
  readonly tileHeight?: number;
  /** Locally bend this many recent tiles away from the automatic run. */
  readonly tailTurnCount?: 0 | 2 | 3 | 4;
  /** Direction of the local recent-tile bend. */
  readonly tailTurnDirection?: -1 | 1;
}

/**
 * How many tiles fit across `availableWidth`, leaving a margin on each side.
 * Used to make the board auto-snake against the real viewport size.
 */
export function tilesPerRowForWidth(availableWidth: number, options: LayoutOptions = {}): number {
  const tileWidth = options.tileWidth ?? TILE_WIDTH;
  const margin = Math.min(120, Math.max(24, availableWidth * 0.08));
  const usable = Math.max(tileWidth, availableWidth - margin * 2);
  // The perspective camera frames the complete chain, so mobile can carry a
  // longer physical run than a one-CSS-pixel-per-board-unit calculation
  // suggests. Five tiles avoids the cramped three-column ladder that made
  // long hands unreadable on phones.
  return Math.min(10, Math.max(5, Math.floor(usable / (tileWidth * 0.72))));
}

/** The footprint a tile occupies on the felt. */
export function tileFootprint(
  vertical: boolean,
  options: LayoutOptions = {},
): { width: number; height: number } {
  const tileWidth = options.tileWidth ?? TILE_WIDTH;
  const tileHeight = options.tileHeight ?? TILE_HEIGHT;
  // A double is laid across the chain, so its footprint is swapped.
  return vertical
    ? { width: tileHeight, height: tileWidth }
    : { width: tileWidth, height: tileHeight };
}

/**
 * Lay the chain out as connected physical runs, centred on the origin.
 * Ordinary tiles stay horizontal. A double crosses its run and becomes the
 * only legal-looking place for that run to fold back in the other direction.
 *
 * Run capacity is viewport-aware, but a fold waits for a nearby double. This
 * prevents a normal tile from being stood on end merely to satisfy a grid.
 */
export function layoutChain(chain: Chain, options: LayoutOptions = {}): BoardSlot[] {
  const perRow = Math.max(1, Math.floor(options.tilesPerRow ?? TILES_PER_ROW));
  // Centre-to-centre pitch matches the tile length: straight runs physically touch.
  const pitch = options.tileWidth ?? TILE_WIDTH;
  const slots: BoardSlot[] = [];
  const add = (tile: PlacedTile, index: number, x: number, y: number, direction: number) => {
    const rotation = (direction + (tile.low === tile.high ? 90 : 0)) % 360;
    const vertical = rotation % 180 !== 0;
    slots.push({
      tile,
      index,
      x,
      y,
      direction,
      rotation,
      vertical,
      ...tileFootprint(vertical, options),
    });
  };
  const spinnerIndex = chain.tiles.findIndex((tile) => tile.id === chain.spinner?.id);
  if (spinnerIndex >= 0) {
    // Reserve a central corridor for both spinner arms. Main-chain snakes
    // stay on their own side, so a growing arm cannot overlap a later row.
    const capacity = Math.max(1, Math.floor(perRow / 2));
    add(chain.tiles[spinnerIndex]!, spinnerIndex, 0, 0, 0);
    for (const side of [-1, 1]) {
      for (let distance = 1; ; distance++) {
        const index = spinnerIndex + side * distance;
        const tile = chain.tiles[index];
        if (!tile) break;
        const row = Math.floor((distance - 1) / capacity);
        const col = (distance - 1) % capacity;
        const x = side * (1 + (row % 2 ? capacity - 1 - col : col)) * pitch;
        const outward =
          col === 0 && row > 0 ? 90 : side === 1 ? (row % 2 ? 180 : 0) : row % 2 ? 0 : 180;
        add(tile, index, x, row * pitch, (outward + (side === -1 ? 180 : 0)) % 360);
      }
    }
    for (const end of ['top', 'bottom'] as const) {
      for (const [index, tile] of (chain.branches?.[end] ?? []).entries()) {
        add(
          tile,
          chain.tiles.length + slots.length,
          0,
          (end === 'top' ? -1 : 1) * (index + 1) * pitch,
          end === 'top' ? 270 : 90,
        );
      }
    }
    slots.sort((a, b) => a.index - b.index);
  } else {
    const turnAfter = new Map<number, -1 | 1>();
    let segmentStart = 0;
    while (segmentStart < chain.tiles.length - 1) {
      const target = segmentStart + perRow - 1;
      if (target >= chain.tiles.length - 1) break;
      const searchEnd = Math.min(
        chain.tiles.length - 2,
        target + Math.max(2, Math.floor(perRow / 2)),
      );
      const candidates: number[] = [];
      for (let index = segmentStart + 1; index <= searchEnd; index += 1) {
        const tile = chain.tiles[index];
        if (tile && tile.low === tile.high) candidates.push(index);
      }
      let anchor = candidates.sort(
        (left, right) => Math.abs(left - target) - Math.abs(right - target),
      )[0];
      // A run without a nearby double must not disable wrapping forever.
      // Continue to the next available double, even if this one run becomes
      // longer than the preferred capacity.
      if (anchor === undefined) {
        for (let index = searchEnd + 1; index < chain.tiles.length - 1; index += 1) {
          const tile = chain.tiles[index];
          if (tile && tile.low === tile.high) {
            anchor = index;
            break;
          }
        }
      }
      if (anchor === undefined) break;
      turnAfter.set(anchor, 1);
      segmentStart = anchor + 1;
    }

    // Manual tail arrangement still honours the physical rule: a run may
    // turn only through a double. If there is no nearby double, Auto remains
    // the only truthful layout instead of standing a normal tile on end.
    const requestedTail = Math.min(
      options.tailTurnCount ?? 0,
      Math.max(0, chain.tiles.length - 1),
    );
    if (requestedTail >= 2) {
      const target = chain.tiles.length - requestedTail - 1;
      let anchor = -1;
      let distance = Number.POSITIVE_INFINITY;
      for (let index = 1; index < chain.tiles.length - 1; index += 1) {
        const tile = chain.tiles[index]!;
        const nextDistance = Math.abs(index - target);
        if (tile.low === tile.high && nextDistance < distance) {
          anchor = index;
          distance = nextDistance;
        }
      }
      if (anchor >= 0) {
        for (const index of [...turnAfter.keys()]) if (index >= anchor) turnAfter.delete(index);
        turnAfter.set(anchor, options.tailTurnDirection ?? 1);
      }
    }

    let horizontal: 1 | -1 = 1;
    chain.tiles.forEach((tile, index) => {
      const previous = slots[index - 1];
      const turn = index > 0 ? turnAfter.get(index - 1) : undefined;
      if (turn !== undefined) horizontal = horizontal === 1 ? -1 : 1;
      const direction = horizontal === 1 ? 0 : 180;
      // Normal tiles never stand on end. Doubles alone cross the run.
      const rotation = tile.low === tile.high ? 90 : direction;
      const vertical = rotation % 180 !== 0;
      const footprint = tileFootprint(vertical, options);

      let x = 0;
      let y = 0;
      if (previous) {
        if (turn !== undefined) {
          const tileWidth = options.tileWidth ?? TILE_WIDTH;
          // The connecting half of the new horizontal tile is centred under
          // the double's lower (or upper) half. Their body edges touch.
          x = previous.x + (vertical ? 0 : horizontal * (tileWidth / 4));
          y = previous.y + turn * (previous.height / 2 + footprint.height / 2);
        } else {
          x = previous.x + horizontal * (previous.width / 2 + footprint.width / 2);
          y = previous.y;
        }
      }
      slots.push({
        tile,
        index,
        x,
        y,
        direction,
        rotation,
        vertical,
        ...footprint,
      });
    });
  }
  if (!slots.length) return slots;
  const bounds = boardBounds(slots);
  return slots.map((slot) => ({ ...slot, x: slot.x - bounds.x, y: slot.y - bounds.y }));
}

export function boardBounds(slots: readonly BoardSlot[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (!slots.length) return { x: 0, y: 0, width: TILE_WIDTH, height: TILE_HEIGHT };
  const left = Math.min(...slots.map((s) => s.x - s.width / 2));
  const right = Math.max(...slots.map((s) => s.x + s.width / 2));
  const top = Math.min(...slots.map((s) => s.y - s.height / 2));
  const bottom = Math.max(...slots.map((s) => s.y + s.height / 2));
  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
  };
}

/** Total footprint of the laid-out chain, for sizing the board container. */
export function boardSize(
  chain: Chain,
  options: LayoutOptions = {},
): { width: number; height: number } {
  const slots = layoutChain(chain, options);
  if (slots.length === 0) {
    return { width: options.tileWidth ?? TILE_WIDTH, height: options.tileHeight ?? TILE_HEIGHT };
  }
  // Footprints differ per tile (doubles are laid across), so the extent is
  // measured from the slot centres plus half of each tile's own footprint.
  const left = Math.min(...slots.map((s) => s.x - s.width / 2));
  const right = Math.max(...slots.map((s) => s.x + s.width / 2));
  const top = Math.min(...slots.map((s) => s.y - s.height / 2));
  const bottom = Math.max(...slots.map((s) => s.y + s.height / 2));
  return { width: right - left, height: bottom - top };
}
