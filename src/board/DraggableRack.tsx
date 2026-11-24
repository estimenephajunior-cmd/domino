/**
 * The player's rack, with drag-and-drop placement on the chain.
 *
 * A tile is dragged from the rack onto an open end of the chain. The end
 * highlights when the tile would legally attach, and the tile snaps into
 * place when it is released. The server still validates every play.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragMoveEvent,
  type Modifier,
} from '@dnd-kit/core';
import { legalMoves } from '../../shared/engine';
import { SNAP_DISTANCE } from '../../shared/drag';
import type { End, PlayerView, Tile } from '../../shared/types';
import { DominoTile } from '../components/DominoTile';

export interface DraggableRackProps {
  readonly view: PlayerView;
  readonly playerId: string | null;
  readonly selectedTileId: string | null;
  readonly selectedEnd: End;
  readonly onSelectTile: (tileId: string) => void;
  readonly onChooseEnd: (end: End) => void;
  /** Called when a tile is dropped on a legal end. */
  readonly onPlay: (tileId: string, end: End, velocity: number) => void;
  readonly enabled?: boolean;
  readonly boardRef: React.RefObject<HTMLDivElement | null>;
  readonly onDragChange: (tile: Tile | null, end: End | null) => void;
}

/** The drag state of the tile under the pointer. */
interface ActiveDrag {
  readonly tile: Tile;
}

export function DraggableRack({
  view,
  playerId,
  selectedTileId,
  selectedEnd,
  onSelectTile,
  onChooseEnd,
  onPlay,
  boardRef,
  onDragChange,
  enabled = true,
}: DraggableRackProps) {
  const yourTurn =
    enabled &&
    view.phase === 'awaiting-play' &&
    !view.phaseFive?.undo.vote &&
    view.currentPlayer === playerId;
  const hand = view.yourHand;
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const [magnet, setMagnet] = useState<{ x: number; y: number; rotation: number } | null>(null);
  const samples = useRef<{ x: number; y: number; at: number }[]>([]);
  const snapEnd = useRef<End | null>(null);

  // A small activation distance keeps taps working as plain selections.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Legal placements for the whole rack, computed once by the shared engine.
  const allMoves = useMemo(
    () => legalMoves(hand, view.chain, view.variant),
    [hand, view.chain, view.variant],
  );
  const options = selectedTileId ? allMoves.filter((m) => m.tile.id === selectedTileId) : [];
  const playableEnds = new Set(options.map((m) => m.end));
  const playableTileIds = new Set(allMoves.map((m) => m.tile.id));

  const handleStart = useCallback(
    (event: DragStartEvent) => {
      const id = String(event.active.id);
      const tile = hand.find((t) => t.id === id);
      if (!tile) return;
      setActive({ tile });
      setMagnet(null);
      samples.current = [];
      snapEnd.current = null;
      onDragChange(tile, null);
    },
    [hand, onDragChange],
  );

  const handleMove = (event: DragMoveEvent) => {
    const rect = event.active.rect.current.translated;
    if (!rect) return;
    const origin = event.activatorEvent as PointerEvent;
    const x =
      typeof origin.clientX === 'number'
        ? origin.clientX + event.delta.x
        : rect.left + rect.width / 2;
    const y =
      typeof origin.clientY === 'number'
        ? origin.clientY + event.delta.y
        : rect.top + rect.height / 2;
    const now = performance.now();
    samples.current = [
      ...samples.current.filter((sample) => now - sample.at < 100),
      { x, y, at: now },
    ];
    const id = String(event.active.id);
    const tile = hand.find((entry) => entry.id === id);
    let nearest: {
      end: End;
      distance: number;
      x: number;
      y: number;
      direction: number;
      pip: number;
    } | null = null;
    for (const move of allMoves.filter((entry) => entry.tile.id === id)) {
      const element = boardRef.current?.querySelector(`[data-testid="drop-${move.end}"]`);
      const target = element?.getBoundingClientRect();
      if (!target) continue;
      const distance = Math.hypot(
        x - target.left - target.width / 2,
        y - target.top - target.height / 2,
      );
      if (distance <= SNAP_DISTANCE && (!nearest || distance < nearest.distance))
        nearest = {
          end: move.end,
          distance,
          x: target.left + target.width / 2,
          y: target.top + target.height / 2,
          direction: Number(element?.getAttribute('data-direction') ?? 0),
          pip: Number(element?.getAttribute('data-pip') ?? 0),
        };
    }
    snapEnd.current = nearest?.end ?? null;
    if (nearest && tile) {
      const heading = (nearest.direction + (nearest.end === 'left' ? 180 : 0)) % 360;
      const flip =
        nearest.end === 'left'
          ? tile.low === nearest.pip
            ? 180
            : 0
          : tile.low === nearest.pip
            ? 0
            : 180;
      setMagnet({
        x: nearest.x,
        y: nearest.y,
        rotation: (heading + (tile.low === tile.high ? 90 : flip)) % 360,
      });
    } else setMagnet(null);
    onDragChange(tile ?? null, snapEnd.current);
  };
  const handleEnd = (event: DragEndEvent) => {
    const id = String(event.active.id);
    const end = snapEnd.current;
    const first = samples.current[0];
    const last = samples.current.at(-1);
    const velocity =
      first && last && performance.now() - last.at < 100
        ? Math.hypot(last.x - first.x, last.y - first.y) / Math.max(1, last.at - first.at)
        : 0;
    setActive(null);
    setMagnet(null);
    onDragChange(null, null);
    if (end && yourTurn && allMoves.some((move) => move.tile.id === id && move.end === end)) {
      onChooseEnd(end);
      onPlay(id, end, velocity);
    }
  };

  const snapOverlay: Modifier = ({ transform, activeNodeRect }) =>
    magnet && activeNodeRect
      ? {
          ...transform,
          x: magnet.x - activeNodeRect.left - activeNodeRect.width / 2,
          y: magnet.y - activeNodeRect.top - activeNodeRect.height / 2,
        }
      : transform;
  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleStart}
      onDragMove={handleMove}
      onDragEnd={handleEnd}
      onDragCancel={() => {
        setActive(null);
        setMagnet(null);
        onDragChange(null, null);
      }}
    >
      <div data-testid="rack" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-slate-500">
            Your rack · {hand.length} tile{hand.length === 1 ? '' : 's'}
          </span>
          {yourTurn && options.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <span>Play on</span>
              {(['left', 'right', 'top', 'bottom'] as const).map((end) => (
                <button
                  key={end}
                  type="button"
                  data-testid={`play-${end}`}
                  disabled={!playableEnds.has(end)}
                  onClick={() => onChooseEnd(end)}
                  className={[
                    'rounded px-2 py-0.5 font-semibold uppercase transition',
                    selectedEnd === end && playableEnds.has(end)
                      ? 'bg-[#D4AF37] text-slate-950'
                      : 'border border-slate-600 text-slate-300',
                    playableEnds.has(end) ? 'cursor-pointer' : 'cursor-not-allowed opacity-40',
                  ].join(' ')}
                >
                  {end}
                </button>
              ))}
            </span>
          )}
        </div>
        <div className="flex min-h-[3.5rem] flex-nowrap items-end gap-1 overflow-x-auto pb-2">
          {hand.length === 0 ? (
            <p className="text-sm text-slate-500">You are out of tiles.</p>
          ) : (
            hand.map((tile) => (
              <RackTile
                key={tile.id}
                tile={tile}
                playable={yourTurn && playableTileIds.has(tile.id)}
                selected={selectedTileId === tile.id}
                onSelect={yourTurn ? () => onSelectTile(tile.id) : undefined}
              />
            ))
          )}
        </div>
      </div>
      <DragOverlay dropAnimation={null} modifiers={[snapOverlay]}>
        {active ? (
          <div
            data-testid="drag-preview"
            data-snapped={magnet !== null}
            style={{
              transform: `scale(1.12) rotate(${magnet?.rotation ?? 0}deg)`,
              filter: 'drop-shadow(0 10px 12px #0009)',
            }}
          >
            <DominoTile tile={active.tile} testId="drag-overlay-tile" playable />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface RackTileProps {
  readonly tile: Tile;
  readonly playable: boolean;
  readonly selected: boolean;
  readonly onSelect?: () => void;
}

/**
 * One tile in the rack.
 *
 * The tile is both a dnd-kit draggable and a plain button, so a tap still
 * selects it while a drag carries it onto the felt.
 */
function RackTile({ tile, playable, selected, onSelect }: RackTileProps) {
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: tile.id,
    disabled: !playable,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.35 : 1,
        touchAction: 'none',
      }}
      className="cursor-grab active:cursor-grabbing"
      {...listeners}
    >
      <DominoTile
        tile={tile}
        testId={`rack-tile-${tile.id}`}
        playable={playable}
        selected={selected}
        onSelect={onSelect}
      />
    </div>
  );
}
