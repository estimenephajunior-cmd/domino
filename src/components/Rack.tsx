import { legalMoves } from '../../shared/engine';
import type { End, PlayerView } from '../../shared/types';
import { DominoTile } from './DominoTile';

export interface RackProps {
  readonly view: PlayerView;
  readonly playerId: string | null;
  readonly selectedTileId: string | null;
  readonly selectedEnd: End;
  readonly onSelectTile: (tileId: string) => void;
  readonly onChooseEnd: (end: End) => void;
}

/**
 * The player's own rack. Tiles are rendered face-up because this view is only
 * ever built from the server's private payload for this player.
 *
 * Legality is highlighted from the shared engine, but the server re-validates
 * every play — the UI never decides a move is legal on its own.
 */
export function Rack({
  view,
  playerId,
  selectedTileId,
  selectedEnd,
  onSelectTile,
  onChooseEnd,
}: RackProps) {
  const yourTurn = view.currentPlayer === playerId;
  const hand = view.yourHand;

  // Legal placements for the whole rack, computed once by the shared engine.
  const allMoves = legalMoves(hand, view.chain, view.variant);
  // Ends that the currently selected tile could legally attach to.
  const options = selectedTileId ? allMoves.filter((m) => m.tile.id === selectedTileId) : [];
  const playableEnds = new Set(options.map((m) => m.end));
  const playableTileIds = new Set(allMoves.map((m) => m.tile.id));

  return (
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
            <DominoTile
              key={tile.id}
              tile={tile}
              testId={`rack-tile-${tile.id}`}
              playable={yourTurn && playableTileIds.has(tile.id)}
              selected={selectedTileId === tile.id}
              onSelect={yourTurn ? () => onSelectTile(tile.id) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}
