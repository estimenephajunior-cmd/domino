import { Flame, Timer, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { DEFAULT_MUTATORS } from '../../shared/mutators';
import type { MutatorConfig } from '../../shared/phaseFive';
import { useTableStore } from '../state/tableStore';

const OPTIONS: readonly { key: keyof MutatorConfig; label: string; detail: string; icon: ReactNode }[] = [
  { key: 'speed', label: 'Speed Dominoes', detail: 'Ten seconds per turn.', icon: <Timer size={17} /> },
  { key: 'wildDouble', label: 'Wild Double', detail: 'A double earns another turn.', icon: <Zap size={17} /> },
  { key: 'hotPotato', label: 'Hot Potato', detail: 'Passing may draw a penalty tile.', icon: <Flame size={17} /> },
];
export function MutatorSettings() {
  const room = useTableStore((state) => state.room); const playerId = useTableStore((state) => state.playerId); const change = useTableStore((state) => state.changeMutators); const connected = useTableStore((state) => state.connected);
  if (!room) return null;
  const config = room.mutators ?? DEFAULT_MUTATORS; const disabled = !connected || room.seats[0]?.id !== playerId;
  return <fieldset className="mutator-fieldset" disabled={disabled}><legend>Optional twists</legend><div className="mutator-grid">{OPTIONS.map((option) => <label key={option.key} className="mutator-card"><input type="checkbox" checked={config[option.key]} onChange={(event) => change({ [option.key]: event.target.checked })} aria-label={option.label} /><span className="mutator-icon">{option.icon}</span><span className="mutator-copy"><strong>{option.label}</strong><small>{option.detail}</small></span><span className="mutator-switch" aria-hidden="true"><i /></span></label>)}</div><p>{disabled ? 'Only the host can change table twists.' : 'Changes clear every player’s ready state.'}</p></fieldset>;
}
