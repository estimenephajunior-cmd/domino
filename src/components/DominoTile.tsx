import type { PlacedTile, Tile } from '../../shared/types';

interface PipLayout {
  readonly cells: ReadonlyArray<readonly [number, number]>;
}

const PIP_LAYOUT = new Map<number, PipLayout>([
  [0, { cells: [] }],
  [1, { cells: [[1, 1]] }],
  [
    2,
    {
      cells: [
        [0, 0],
        [2, 2],
      ],
    },
  ],
  [
    3,
    {
      cells: [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
    },
  ],
  [
    4,
    {
      cells: [
        [0, 0],
        [0, 2],
        [2, 0],
        [2, 2],
      ],
    },
  ],
  [
    5,
    {
      cells: [
        [0, 0],
        [0, 2],
        [1, 1],
        [2, 0],
        [2, 2],
      ],
    },
  ],
  [
    6,
    {
      cells: [
        [0, 0],
        [0, 2],
        [1, 0],
        [1, 2],
        [2, 0],
        [2, 2],
      ],
    },
  ],
  [
    7,
    {
      cells: [
        [0, 0],
        [0, 2],
        [1, 0],
        [1, 1],
        [1, 2],
        [2, 0],
        [2, 2],
      ],
    },
  ],
  [
    8,
    {
      cells: [
        [0, 0],
        [0, 2],
        [1, 0],
        [1, 2],
        [2, 0],
        [2, 2],
        [0, 1],
        [2, 1],
      ],
    },
  ],
  [
    9,
    {
      cells: [
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 0],
        [1, 1],
        [1, 2],
        [2, 0],
        [2, 1],
        [2, 2],
      ],
    },
  ],
]);

function Half({ value, testId }: { value: number; testId?: string }) {
  const layout = PIP_LAYOUT.get(value) ?? { cells: [] as const };
  return (
    <span
      data-testid={testId}
      className="grid h-10 w-10 grid-cols-3 grid-rows-3 gap-px bg-[#F7F3E8]"
      aria-label={`${value} pips`}
    >
      {Array.from({ length: 9 }, (_, i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const on = layout.cells.some(([r, c]) => r === row && c === col);
        return (
          <span key={i} className="flex items-center justify-center">
            {on && <span className="h-1.5 w-1.5 rounded-full bg-slate-900" />}
          </span>
        );
      })}
    </span>
  );
}

export interface DominoTileProps {
  readonly tile: Tile;
  readonly orientation?: 'horizontal' | 'vertical';
  readonly selected?: boolean;
  readonly playable?: boolean;
  readonly onSelect?: () => void;
  readonly testId?: string;
}

/**
 * One domino tile: ivory halves, brass pips-shadow, clear pip counts.
 * Purely presentational — legality is decided by the server, never here.
 */
export function DominoTile({
  tile,
  orientation = 'horizontal',
  selected = false,
  playable = false,
  onSelect,
  testId,
}: DominoTileProps) {
  const vertical = orientation === 'vertical';
  return (
    <button
      type="button"
      data-testid={testId}
      data-playable={playable ? 'true' : 'false'}
      disabled={!onSelect}
      onClick={onSelect}
      aria-label={`Domino ${tile.low} by ${tile.high}${playable ? ', playable' : ''}`}
      className={[
        'flex items-center justify-center gap-0 overflow-hidden rounded-md bg-[#F7F3E8] p-0 transition',
        vertical ? 'flex-col' : 'flex-row',
        'shadow-[0_2px_6px_rgba(0,0,0,0.45)]',
        playable ? 'ring-2 ring-[#F59E0B] ring-offset-1 ring-offset-transparent' : '',
        selected ? 'scale-112 -translate-y-1 shadow-[0_6px_16px_rgba(245,158,11,0.35)]' : '',
        onSelect ? 'cursor-pointer hover:-translate-y-0.5' : 'cursor-default',
      ].join(' ')}
    >
      <Half value={tile.low} testId={testId ? `${testId}-low` : undefined} />
      <span
        aria-hidden
        className={vertical ? 'h-px w-8 bg-slate-900/80' : 'h-8 w-px bg-slate-900/80'}
      />
      <Half value={tile.high} testId={testId ? `${testId}-high` : undefined} />
    </button>
  );
}

export interface PlacedTileProps {
  readonly tile: PlacedTile;
  readonly vertical: boolean;
  readonly testId?: string;
}

/**
 * A tile as it lies on the board. The `left`/`right` halves are already
 * oriented by the engine, so the renderer never re-derives the flip.
 */
export function PlacedTileView({ tile, vertical, testId }: PlacedTileProps) {
  return (
    <div
      data-testid={testId}
      aria-label={`Domino ${tile.left} by ${tile.right} on the board`}
      className={[
        'flex items-center justify-center gap-0 overflow-hidden rounded-md bg-[#F7F3E8]',
        'shadow-[0_2px_6px_rgba(0,0,0,0.45)]',
        vertical ? 'h-20 w-10 flex-col' : 'h-10 w-20 flex-row',
      ].join(' ')}
    >
      <Half value={tile.left} />
      <span
        aria-hidden
        className={vertical ? 'h-px w-8 bg-slate-900/80' : 'h-8 w-px bg-slate-900/80'}
      />
      <Half value={tile.right} />
    </div>
  );
}
