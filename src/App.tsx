import { RULE_VARIANTS, VARIANT_RULES } from '../shared/types';

/**
 * Application shell. The full table (PixiJS board, WebRTC voice seats,
 * boardgame.io client) mounts here in later milestones; for now the app
 * wires the real shared variant config so the build is end-to-end honest.
 */
export function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Domino Engine</h1>
        <p className="text-slate-400">
          P2P voice domino table — deterministic core, provably fair shuffles, spatial audio.
        </p>
      </header>

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="mb-4 text-lg font-semibold">Rule variants</h2>
        <ul className="grid gap-2">
          {RULE_VARIANTS.map((id) => {
            const rules = VARIANT_RULES[id];
            return (
              <li
                key={id}
                className="flex items-center justify-between rounded-lg bg-slate-950/60 px-4 py-2"
              >
                <span className="font-medium">{rules.label}</span>
                <span className="text-sm text-slate-500">
                  {rules.allowDraw ? 'Draw' : 'Block'} ·{' '}
                  {rules.pipScoring ? 'Pip scoring' : 'One point'}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
