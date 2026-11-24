import { useMemo, useState } from 'react';
import { Eye, ShieldCheck } from 'lucide-react';
import { analyzeShadow } from '../../shared/shadow';
import type { End, PlayerView } from '../../shared/types';

export function ShadowPredictor({
  view,
  playerId,
  onSuggest,
}: {
  readonly view: PlayerView;
  readonly playerId: string;
  readonly onSuggest: (tileId: string, end: End) => void;
}) {
  const [open, setOpen] = useState(false);
  const analysis = useMemo(() => analyzeShadow(view, playerId), [view, playerId]);
  const suggestion = analysis.safestMove;
  return (
    <div className="relative" data-testid="shadow-predictor">
      <button
        type="button"
        data-testid="shadow-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="rounded-lg border border-cyan-300/30 bg-cyan-950/35 px-3 py-1.5 text-xs text-cyan-100"
      >
        <Eye size={14} className="mr-1 inline" /> Shadow
      </button>
      {open && (
        <section
          aria-label="Shadow Predictor"
          className="absolute bottom-full left-0 z-40 mb-2 max-h-[70vh] w-80 overflow-auto rounded-xl border border-cyan-300/20 bg-[var(--theme-panel)] p-3 shadow-2xl"
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold text-cyan-100">Domino Shadow</h2>
              <p className="text-[10px] text-[var(--theme-muted)]">
                Local estimate from visible tiles, passes, and draws.
              </p>
            </div>
            <span className="rounded bg-cyan-400/10 px-1.5 py-0.5 text-[10px] text-cyan-200">
              {analysis.unknownTiles.length} unknown
            </span>
          </div>

          <h3 className="mb-1 text-xs font-semibold">Pip heatmap</h3>
          <div className="mb-3 grid grid-cols-7 gap-1" data-testid="shadow-heatmap">
            {analysis.heatmap.map((entry) => (
              <div key={entry.pip} className="text-center text-[10px]">
                <div
                  className="flex h-14 items-end overflow-hidden rounded bg-black/25"
                  title={`${Math.round(entry.probability * 100)}% opponent coverage`}
                >
                  <div
                    className="w-full bg-cyan-400/70"
                    style={{ height: `${Math.round(entry.probability * 100)}%` }}
                  />
                </div>
                <span>{entry.pip}</span>
              </div>
            ))}
          </div>

          <div className="mb-3 space-y-1">
            {analysis.opponents.map((opponent) => (
              <p key={opponent.playerId} className="text-[11px] text-[var(--theme-muted)]">
                <strong className="text-[var(--theme-text)]">{opponent.name}</strong>:{' '}
                {opponent.excludedPips.length
                  ? `passed on ${opponent.excludedPips.join('/')} · ${opponent.drawsAfterPass} later draws`
                  : 'no pass constraint yet'}
              </p>
            ))}
          </div>

          {suggestion ? (
            <div className="rounded-lg border border-cyan-300/20 bg-cyan-950/25 p-2">
              <p className="text-xs font-semibold">
                <ShieldCheck size={14} className="mr-1 inline" /> Safest tile: {suggestion.tile.low}|
                {suggestion.tile.high} on {suggestion.end}
              </p>
              <p className="my-1 text-[10px] text-[var(--theme-muted)]">{suggestion.reason}</p>
              <button
                type="button"
                data-testid="shadow-suggest"
                onClick={() => onSuggest(suggestion.tile.id, suggestion.end)}
                className="rounded bg-cyan-300 px-2 py-1 text-[11px] font-semibold text-slate-950"
              >
                Select suggestion
              </button>
            </div>
          ) : (
            <p className="text-xs text-[var(--theme-muted)]">No legal move is currently available.</p>
          )}

          {analysis.rankedMoves.length > 1 && (
            <ol className="mt-2 space-y-1 text-[10px] text-[var(--theme-muted)]">
              {analysis.rankedMoves.slice(1, 4).map((move) => (
                <li key={`${move.tile.id}-${move.end}`}>
                  {move.tile.low}|{move.tile.high} {move.end} · {move.reason}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
