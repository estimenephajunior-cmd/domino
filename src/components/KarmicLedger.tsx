import { lazy, Suspense, useState } from 'react';
import { BookOpen, Crown, X } from 'lucide-react';
import { useLedger } from '../ledger/useLedger';

const RivalryChart = lazy(() =>
  import('./RivalryChart').then((module) => ({ default: module.RivalryChart })),
);

export function KarmicLedger() {
  const [open, setOpen] = useState(false);
  const ledger = useLedger();
  const snapshot = ledger.snapshot;
  const topRival = snapshot?.rivalries[0];
  return (
    <div className="relative">
      <button
        type="button"
        data-testid="ledger-toggle"
        onClick={() => {
          setOpen(true);
          void ledger.refresh();
        }}
        className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs"
      >
        <BookOpen size={14} className="mr-1 inline" /> Ledger
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-3">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Karmic Ledger"
            className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-white/10 bg-[var(--theme-panel)] p-4 shadow-2xl"
          >
            <header className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">Karmic Ledger</h2>
                <p className="text-xs text-[var(--theme-muted)]">Your local rivalry memory.</p>
              </div>
              <button type="button" aria-label="Close ledger" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </header>
            {ledger.loading && !snapshot ? (
              <p>Opening the ledger…</p>
            ) : !snapshot || snapshot.matchesPlayed === 0 ? (
              <p className="rounded-lg bg-white/5 p-4 text-sm text-[var(--theme-muted)]">
                Complete a hand to begin your match history.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Matches" value={snapshot.matchesPlayed} />
                  <Stat label="Wins" value={snapshot.wins} />
                  <Stat label="Win rate" value={`${Math.round(snapshot.winRate * 100)}%`} />
                </div>
                {snapshot.title && (
                  <p className="my-3 rounded-lg bg-amber-400/10 p-2 text-sm text-amber-200">
                    <Crown size={15} className="mr-1 inline" /> {snapshot.title}
                  </p>
                )}
                {topRival && (
                  <div className="mt-3 rounded-xl bg-white/5 p-3">
                    <h3 className="text-sm font-semibold">Most-played rival: {topRival.name}</h3>
                    <p className="text-xs text-[var(--theme-muted)]">
                      {topRival.matches} hands · {topRival.myWins}-{topRival.rivalWins} record
                    </p>
                    <Suspense fallback={<div className="h-44" />}>
                      <RivalryChart rivalry={topRival} />
                    </Suspense>
                  </div>
                )}
                <h3 className="mb-1 mt-4 text-sm font-semibold">Recent hands</h3>
                <ul className="space-y-1 text-xs">
                  {snapshot.history.map((match) => {
                    const mine = match.players.find((player) => player.profileId === snapshot.profileId);
                    return (
                      <li key={match.id} className="flex justify-between rounded bg-white/5 px-2 py-1.5">
                        <span>{match.variant} · {new Date(match.playedAt).toLocaleDateString()}</span>
                        <strong className={mine?.won ? 'text-emerald-300' : 'text-slate-400'}>
                          {mine?.won ? 'Won' : 'Lost'}
                        </strong>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: string | number }) {
  return <div className="rounded-lg bg-white/5 p-2"><span className="block text-[10px] text-[var(--theme-muted)]">{label}</span><strong>{value}</strong></div>;
}
