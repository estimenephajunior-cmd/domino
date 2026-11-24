/**
 * Relative seat model for the table.
 *
 * The local player always perceives themselves at the bottom of the table.
 * Every other seat is described relative to that perspective, so spatial
 * voice, avatars and tiles all agree on one mapping.
 */

/** Where a seat sits relative to the local player. */
export type TablePosition = 'bottom' | 'left' | 'top' | 'right';

/**
 * Seats in clockwise order starting at the local player's seat.
 * Domino turn order runs clockwise, so seat indices advance through this list.
 */
export const POSITION_ORDER: readonly TablePosition[] = ['bottom', 'left', 'top', 'right'];

/** How many seats the table holds. */
export const SEAT_COUNT = 4;

/** A point in the Web Audio listener space, relative to the local player. */
export interface SpatialPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Spatial coordinates per relative position.
 *
 * The local player occupies the listener origin, so their own voice is
 * never panned. Opponents are placed to the left, far ahead and to the
 * right, matching the table layout.
 */
const SPATIAL_POINTS: Record<TablePosition, SpatialPoint> = {
  bottom: { x: 0, y: 0, z: 0 },
  left: { x: -0.85, y: 0, z: 0 },
  top: { x: 0, y: 0, z: -1.0 },
  right: { x: 0.85, y: 0, z: 0 },
};

/**
 * The relative position of a seat.
 *
 * @param seatIndex the seat's index in the room roster (turn order)
 * @param localSeatIndex the index of the local player's own seat
 */
export function positionOfSeat(seatIndex: number, localSeatIndex: number): TablePosition {
  const offset = (((seatIndex - localSeatIndex) % SEAT_COUNT) + SEAT_COUNT) % SEAT_COUNT;
  return POSITION_ORDER[offset] ?? 'bottom';
}

/** The listener-space coordinates for a relative position. */
export function spatialPoint(position: TablePosition): SpatialPoint {
  return SPATIAL_POINTS[position];
}

/** The seat index of the local player within a roster of seat indices. */
export function localSeatIndex(
  seatIndices: readonly number[],
  playerId: string,
  ids: readonly string[],
): number {
  const index = ids.indexOf(playerId);
  if (index === -1) return 0;
  return seatIndices[index] ?? 0;
}

/**
 * Build the position of every player in a room, relative to the local one.
 * Players without a seat are skipped.
 */
export function relativePositions(
  players: readonly { id: string; seat: number }[],
  localPlayerId: string,
): Map<string, TablePosition> {
  const seated = [...players].sort((a, b) => a.seat - b.seat);
  const local = seated.find((p) => p.id === localPlayerId);
  const localSeat = local?.seat ?? 0;
  const positions = new Map<string, TablePosition>();
  for (const player of seated) {
    positions.set(player.id, positionOfSeat(player.seat, localSeat));
  }
  return positions;
}
