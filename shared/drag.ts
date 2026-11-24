import { openEnds } from './graph.js';
/**
 * Drag-and-drop placement: magnet snapping, rotation and legal-target
 * feedback for tiles dragged from the rack onto the chain.
 *
 * Pure logic, deliberately free of React and dnd-kit so the snapping rules
 * can be unit tested and reused by any renderer.
 */
import { layoutChain, type BoardSlot, type LayoutOptions } from './board.js';
import type { Chain, End, Tile } from './types.js';

/** Distance (px) within which a dragged tile snaps onto a chain end. */
export const SNAP_DISTANCE = 40;

/** The glow colour used for legal placement targets. */
export const LEGAL_TARGET_COLOR = '#F59E0B';

/** A legal placement the player can drop onto. */
export interface DropTarget {
  readonly end: End;
  /** Board-space centre of the end the tile would attach to. */
  readonly x: number;
  readonly y: number;
  /** The pip value the chain end currently shows. */
  readonly pip: number;
  /** True when the dragged tile can legally attach here. */
  readonly legal: boolean;
  readonly direction?: number;
}

/** A snap decision for a dragged tile. */
export interface SnapResult {
  /** The end the tile snapped to, or null when it snapped to nothing. */
  readonly end: End | null;
  /** How the tile must be rotated when it lands. */
  readonly rotation: 0 | 90 | 180 | 270;
  /** The snapped tile's board-space centre. */
  readonly x: number;
  readonly y: number;
  /** True when the tile is a double and is laid across the chain. */
  readonly vertical: boolean;
  /** True when a legal target was within snapping distance. */
  readonly snapped: boolean;
}

/**
 * The board-space position of a chain's open ends.
 *
 * The ends sit just beyond the outermost tiles, so a dragged tile visibly
 * lines up with the chain it will join.
 */
export function chainEnds(chain: Chain, options: LayoutOptions = {}): DropTarget[] {
  const slots = layoutChain(chain, options);
  if (slots.length === 0) {
    // An empty chain has a single open end in the middle of the felt.
    return [{ end: 'right', x: 0, y: 0, pip: chain.rightEnd, legal: false }];
  }
  const first = slots[0]!;
  const last = slots[chain.tiles.length - 1]!;
  const halfWidth = (options.tileWidth ?? 92) / 2;
  const tip = (slot: BoardSlot, reverse = false) => {
    const direction = ((slot.direction ?? 0) + (reverse ? 180 : 0)) % 360;
    const radians = (direction * Math.PI) / 180;
    return {
      x: slot.x + Math.cos(radians) * (halfWidth + 30),
      y: slot.y + Math.sin(radians) * (halfWidth + 30),
      direction,
    };
  };
  const targets: DropTarget[] = [
    {
      end: 'left',
      ...tip(first, true),
      pip: chain.leftEnd,
      legal: false,
    },
    {
      end: 'right',
      ...tip(last),
      pip: chain.rightEnd,
      legal: false,
    },
  ];
  for (const target of openEnds(chain)) {
    if (target.end !== 'top' && target.end !== 'bottom') continue;
    const arm = chain.branches?.[target.end] ?? [];
    const tileId = arm[arm.length - 1]?.id ?? chain.spinner?.id;
    const slot = slots.find((entry) => entry.tile.id === tileId);
    if (slot)
      targets.push({
        ...target,
        ...(arm.length
          ? tip(slot)
          : {
              x: slot.x,
              y: slot.y + (target.end === 'top' ? -1 : 1) * (halfWidth + 30),
              direction: target.end === 'top' ? 270 : 90,
            }),
        legal: false,
      });
  }
  return targets;
}

/**
 * Work out where a dragged tile would land.
 *
 * The tile snaps to the nearest chain end within `SNAP_DISTANCE`; otherwise
 * it stays where it was dropped. Rotation is derived from which half of the
 * tile has to meet the chain's pip.
 */
export function resolveSnap(
  tile: Tile,
  chain: Chain,
  pointer: { x: number; y: number },
  options: LayoutOptions & { readonly legalEnds?: readonly End[]; readonly zoom?: number } = {},
): SnapResult {
  const ends = chainEnds(chain, options);
  const legalEnds = options.legalEnds ?? [];

  let best: { target: DropTarget; distance: number } | null = null;
  for (const target of ends) {
    const dx = pointer.x - target.x;
    const dy = pointer.y - target.y;
    const distance = Math.hypot(dx, dy) * (options.zoom ?? 1);
    if (distance > SNAP_DISTANCE) continue;
    if (!best || distance < best.distance) {
      best = { target, distance };
    }
  }

  if (!best) {
    // Nothing in range: the tile drops where the pointer released it.
    return {
      end: null,
      rotation: 0,
      x: pointer.x,
      y: pointer.y,
      vertical: tile.low === tile.high,
      snapped: false,
    };
  }

  const target = best.target;

  // On the left end the chain runs to the right, so the matching half must
  // face right; on the right end it must face left. Rotation 0 is the tile as
  // drawn (low on the left, high on the right), so flipping is 180 degrees.
  let rotation: 0 | 90 | 180 | 270 = 0;
  if (target.end === 'left') {
    rotation = tile.low === target.pip ? 180 : 0;
  } else {
    rotation = tile.low === target.pip ? 0 : 180;
  }
  // A double is always laid across the chain.
  if (tile.low === tile.high) {
    rotation = 90;
  }
  const heading =
    target.end === 'left' ? ((target.direction ?? 180) + 180) % 360 : (target.direction ?? 0);
  rotation = ((rotation + heading) % 360) as SnapResult['rotation'];

  return {
    end: target.end,
    rotation,
    x: target.x,
    y: target.y,
    vertical: tile.low === tile.high,
    snapped: legalEnds.includes(target.end),
  };
}

/**
 * The legal ends for a tile, given the chain's open pips.
 * A tile that matches neither end cannot be placed.
 */
export function legalEndsFor(tile: Tile, chain: Chain): End[] {
  return openEnds(chain)
    .filter((end) => tile.low === end.pip || tile.high === end.pip)
    .map((end) => end.end);
}

/**
 * Where a tile would land on the board, expressed in the same coordinate
 * space as `layoutChain`. Used by the drag overlay to preview the placement.
 */
export function previewSlot(
  chain: Chain,
  tile: Tile,
  end: End,
  options: LayoutOptions = {},
): BoardSlot {
  const slots = layoutChain(chain, options);
  const ends = chainEnds(chain, options);
  const target = ends.find((e) => e.end === end) ?? ends[0]!;
  // The engine orients a tile so the half matching the chain's pip faces
  // the chain: on the left end that is the right half, on the right end the
  // left half. Mirror that here so the preview matches the real placement.
  const matchesLow = tile.low === target.pip;
  const left =
    end === 'left' ? (matchesLow ? tile.high : tile.low) : matchesLow ? tile.low : tile.high;
  const right =
    end === 'left' ? (matchesLow ? tile.low : tile.high) : matchesLow ? tile.high : tile.low;
  const vertical = tile.low === tile.high;
  const placed = { ...tile, left, right };
  const direction =
    end === 'left' ? ((target.direction ?? 180) + 180) % 360 : (target.direction ?? 0);
  const rotation = (direction + (vertical ? 90 : 0)) % 360;
  const last = slots[slots.length - 1];
  return {
    tile: placed,
    index: (last?.index ?? -1) + 1,
    x: target.x,
    y: target.y,
    vertical: rotation % 180 !== 0,
    direction,
    rotation,
    width: rotation % 180 !== 0 ? (options.tileHeight ?? 44) : (options.tileWidth ?? 92),
    height: rotation % 180 !== 0 ? (options.tileWidth ?? 92) : (options.tileHeight ?? 44),
  };
}
