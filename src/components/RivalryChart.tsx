import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RivalrySummary } from '../../shared/ledger';

export function RivalryChart({ rivalry }: { readonly rivalry: RivalrySummary }) {
  const data = rivalry.series.map((point, index) => ({ ...point, game: index + 1 }));
  return (
    <div className="h-44 w-full" data-testid="rivalry-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -25 }}>
          <CartesianGrid stroke="rgba(148,163,184,.15)" />
          <XAxis dataKey="game" tick={{ fontSize: 10 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Line type="monotone" dataKey="myWins" name="Your wins" stroke="#22d3ee" />
          <Line type="monotone" dataKey="rivalWins" name={`${rivalry.name} wins`} stroke="#f59e0b" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
