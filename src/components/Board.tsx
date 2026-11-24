import { lazy, Suspense, useState } from 'react';
import { layoutChain, type LayoutOptions } from '../../shared/board';
import type { CameraState } from '../../shared/camera';
import { chainEnds, previewSlot } from '../../shared/drag';
import type { Chain, End, Phase, PublicDealSlot, Tile } from '../../shared/types';
import { PlacedTileView } from './DominoTile';
const ThreeBoard = lazy(() =>
  import('../board/ThreeBoard').then((module) => ({ default: module.ThreeBoard })),
);

export interface BoardProps {
  readonly chain: Chain;
  readonly usePixi?: boolean;
  readonly camera?: CameraState;
  readonly layout?: LayoutOptions;
  readonly legalEnds?: readonly End[];
  readonly preview?: { tile: Tile; end: End } | null;
  readonly impact?: { tileId: string; velocity: number; winning: boolean } | null;
  readonly phase?: Phase;
  readonly dealSlots?: readonly PublicDealSlot[];
  readonly mixingEndsAt?: number | null;
  readonly canPick?: boolean;
  readonly cameraAction?: { readonly id: number; readonly type: 'fit' | 'zoom-in' | 'zoom-out' };
  readonly feltColor?: string;
  readonly onPick?: (slotId: string) => void;
}
export function Board({
  chain,
  usePixi = true,
  camera = { x: 0, y: 0, zoom: 1 },
  layout = {},
  legalEnds = [],
  preview,
  phase = 'awaiting-play',
  dealSlots = [],
  mixingEndsAt = null,
  canPick = false,
  cameraAction,
  feltColor = '#0c4b32',
  onPick = () => {},
}: BoardProps) {
  const [renderer, setRenderer] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const slots = layoutChain(chain, layout);
  const ghost = preview ? previewSlot(chain, preview.tile, preview.end, layout) : null;
  return (
    <div
      data-testid="board"
      data-renderer={renderer}
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {usePixi && renderer !== 'fallback' && (
        <Suspense fallback={null}>
          <ThreeBoard
            chain={chain}
            layout={layout}
            phase={phase}
            dealSlots={dealSlots}
            mixingEndsAt={mixingEndsAt}
            canPick={canPick}
            cameraAction={cameraAction}
            feltColor={feltColor}
            onPick={onPick}
            onReady={() => setRenderer('ready')}
            onError={() => setRenderer('fallback')}
          />
        </Suspense>
      )}
      <div
        className="absolute left-1/2 top-1/2 transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{
          transform: `scale(${camera.zoom}) translate(${-camera.x}px, ${-camera.y}px)`,
        }}
      >
        {(phase === 'mixing' || phase === 'picking') && (
          <div
            className={
              renderer === 'ready'
                ? 'pointer-events-auto sr-only'
                : 'pointer-events-auto grid grid-cols-7 gap-2 p-4'
            }
            role="grid"
            aria-label="Face-down dominoes"
          >
            {dealSlots.map((slot) =>
              slot.claimed ? null : (
                <button
                  key={slot.id}
                  type="button"
                  data-testid={`deal-${slot.id}`}
                  data-deal-slot="true"
                  disabled={!canPick}
                  onClick={() => onPick(slot.id)}
                  className="h-10 rounded-md bg-[#171b19] shadow-md outline outline-2 outline-[#eee5d4] disabled:opacity-70"
                  aria-label="Pick face-down domino"
                />
              ),
            )}
          </div>
        )}
        {ghost && (
          <div
            data-testid="placement-preview"
            className="absolute opacity-75"
            style={{
              left: ghost.x,
              top: ghost.y,
              transform: `translate(-50%, -50%) rotate(${ghost.rotation ?? 0}deg)`,
            }}
          >
            <PlacedTileView tile={ghost.tile} vertical={false} />
          </div>
        )}
        <div
          role="list"
          aria-label={`Chain of ${slots.length} tiles`}
          style={{ opacity: renderer === 'ready' && usePixi ? 0 : 1 }}
        >
          {slots.map((slot) => (
            <div
              key={slot.tile.id}
              role="listitem"
              data-testid="board-tile"
              data-double={slot.tile.low === slot.tile.high}
              data-vertical={slot.vertical}
              data-rotation={slot.rotation ?? 0}
              className="absolute"
              style={{
                left: slot.x,
                top: slot.y,
                transform: `translate(-50%, -50%) rotate(${slot.rotation ?? 0}deg)`,
              }}
            >
              <PlacedTileView tile={slot.tile} vertical={false} />
            </div>
          ))}
        </div>
        {(legalEnds.length > 0 || preview ? chainEnds(chain, layout) : []).map((target) => (
          <div
            key={target.end}
            data-testid={`drop-${target.end}`}
            data-direction={target.direction ?? 0}
            data-pip={target.pip}
            data-legal={legalEnds.includes(target.end)}
            aria-label={`${target.end} end: ${target.pip}${legalEnds.includes(target.end) ? ', legal placement' : ''}`}
            className="absolute flex h-11 w-14 items-center justify-center rounded-lg border border-dashed text-xs"
            style={{
              left: target.x,
              top: target.y,
              transform: 'translate(-50%, -50%)',
              borderColor: legalEnds.includes(target.end) ? '#F59E0B' : '#64748b',
              color: '#D4AF37',
              boxShadow: legalEnds.includes(target.end) ? '0 0 18px #F59E0B80' : undefined,
              background: preview?.end === target.end ? '#F59E0B50' : '#0B1A14cc',
            }}
          >
            {preview?.end === target.end ? `${preview.tile.low}|${preview.tile.high}` : target.pip}
          </div>
        ))}
      </div>
    </div>
  );
}
