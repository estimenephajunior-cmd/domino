import type { Chain, End, PlacedTile, Tile } from './types.js';

export interface OpenEnd {
  readonly end: End;
  readonly pip: number;
  readonly count: number;
}

/** Side arms open only after both long sides of the spinner are occupied. */
export function spinnerOpen(chain: Chain): boolean {
  const index = chain.tiles.findIndex((tile) => tile.id === chain.spinner?.id);
  return index > 0 && index < chain.tiles.length - 1;
}

export function openEnds(chain: Chain): OpenEnd[] {
  const first = chain.tiles[0];
  const last = chain.tiles[chain.tiles.length - 1];
  const count = (tile: PlacedTile | undefined, pip: number) =>
    tile && tile.low === tile.high ? pip * 2 : pip;
  // A solitary double is counted once, with both halves exposed.
  if (chain.tiles.length === 1) {
    return [
      { end: 'left', pip: chain.leftEnd, count: first?.left ?? chain.leftEnd },
      { end: 'right', pip: chain.rightEnd, count: first?.right ?? chain.rightEnd },
    ];
  }
  const ends: OpenEnd[] = [
    { end: 'left', pip: chain.leftEnd, count: count(first, chain.leftEnd) },
    { end: 'right', pip: chain.rightEnd, count: count(last, chain.rightEnd) },
  ];
  if (chain.spinner && spinnerOpen(chain)) {
    for (const end of ['top', 'bottom'] as const) {
      const arm = chain.branches?.[end] ?? [];
      const tip = arm[arm.length - 1];
      ends.push({
        end,
        pip: tip?.right ?? chain.spinner.low,
        count: tip ? count(tip, tip.right) : 0,
      });
    }
  }
  return ends;
}

export function allBoardTiles(chain: Chain): readonly PlacedTile[] {
  return [...chain.tiles, ...(chain.branches?.top ?? []), ...(chain.branches?.bottom ?? [])];
}

export function placeBranch(chain: Chain, tile: Tile, end: 'top' | 'bottom'): Chain {
  const pip = openEnds(chain).find((target) => target.end === end)?.pip;
  if (pip === undefined || (tile.low !== pip && tile.high !== pip)) {
    throw new Error('Illegal spinner branch placement');
  }
  const placed = { ...tile, left: pip, right: tile.low === pip ? tile.high : tile.low };
  const branches = chain.branches ?? { top: [], bottom: [] };
  return { ...chain, branches: { ...branches, [end]: [...branches[end], placed] } };
}

export function scoreExposedEnds(chain: Chain): number {
  const total = openEnds(chain).reduce((sum, end) => sum + end.count, 0);
  return total > 0 && total % 5 === 0 ? total : 0;
}
