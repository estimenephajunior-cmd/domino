import { createRoot } from 'react-dom/client';
import type { Chain, PlacedTile } from '../../shared/types';
import { Board } from '../../src/components/Board';

interface Edge {
  readonly id: string;
  readonly low: number;
  readonly high: number;
}

/** Build a deterministic Euler circuit containing every double-six tile once. */
export function fullDoubleSixChain(): Chain {
  const edges: Edge[] = [];
  for (let low = 0; low <= 6; low += 1)
    for (let high = low; high <= 6; high += 1)
      edges.push({ id: `${low}-${high}`, low, high });

  const adjacency = Array.from({ length: 7 }, () => [] as number[]);
  edges.forEach((edge, index) => {
    adjacency[edge.low]!.push(index);
    if (edge.high !== edge.low) adjacency[edge.high]!.push(index);
  });
  adjacency.forEach((list) => list.sort((left, right) => right - left));

  const used = new Set<number>();
  const stack: { vertex: number; tile?: PlacedTile }[] = [{ vertex: 0 }];
  const reversed: PlacedTile[] = [];
  while (stack.length > 0) {
    const current = stack[stack.length - 1]!;
    let edgeIndex: number | undefined;
    while (adjacency[current.vertex]!.length > 0) {
      const candidate = adjacency[current.vertex]!.pop()!;
      if (!used.has(candidate)) {
        edgeIndex = candidate;
        break;
      }
    }
    if (edgeIndex === undefined) {
      const finished = stack.pop()!;
      if (finished.tile) reversed.push(finished.tile);
      continue;
    }
    used.add(edgeIndex);
    const edge = edges[edgeIndex]!;
    const next = edge.low === current.vertex ? edge.high : edge.low;
    stack.push({
      vertex: next,
      tile: { ...edge, left: current.vertex, right: next },
    });
  }

  const tiles = reversed.reverse();
  if (tiles.length !== 28) throw new Error(`Expected 28 tiles, received ${tiles.length}.`);
  for (let index = 1; index < tiles.length; index += 1)
    if (tiles[index - 1]!.right !== tiles[index]!.left)
      throw new Error(`Broken fixture chain at tile ${index}.`);

  return {
    tiles,
    leftEnd: tiles[0]!.left,
    rightEnd: tiles[tiles.length - 1]!.right,
    spinner: null,
  };
}

export function mountFullBoard(): void {
  const fixture = document.createElement('main');
  fixture.id = 'full-board-fixture';
  fixture.dataset.tileCount = '28';
  fixture.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:99999',
    'overflow:hidden',
    'background:#07150f',
  ].join(';');
  document.body.appendChild(fixture);
  createRoot(fixture).render(
    <div style={{ position: 'absolute', inset: 0 }}>
      <Board
        chain={fullDoubleSixChain()}
        phase="awaiting-play"
        usePixi
        feltColor="#19341f"
      />
    </div>,
  );
}
