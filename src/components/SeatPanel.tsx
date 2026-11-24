import { relativePositions } from '../../shared/seats';
import type { PeerVoiceState } from '../../shared/voice';
import type { PlayerView } from '../../shared/types';
import { useTableStore } from '../state/tableStore';

export interface SeatPanelProps {
  readonly view: PlayerView;
  readonly playerId: string | null;
  readonly peers?: Record<string, Partial<PeerVoiceState>>;
  readonly localSpeaking?: boolean;
}

export function SeatPanel({ view, playerId, peers = {}, localSpeaking = false }: SeatPanelProps) {
  const room = useTableStore((state) => state.room);
  const positions = relativePositions(room?.seats ?? view.players.map((player, seat) => ({ ...player, seat })), playerId ?? '');
  const classes = { top: 'left-1/2 top-1 -translate-x-1/2', bottom: 'bottom-1 left-1/2 -translate-x-1/2', left: 'left-1 top-1/2 -translate-y-1/2', right: 'right-1 top-1/2 -translate-y-1/2' };
  return (
    <div data-testid="seat-panel" className="pointer-events-none absolute inset-0 z-10">
      {view.players.map((player) => {
        const isYou = player.id === playerId;
        const speaking = isYou ? localSpeaking : peers[player.id]?.speaking === true;
        const isTurn = player.id === view.currentPlayer;
        return (
          <div key={player.id} data-position={positions.get(player.id)} data-speaking={speaking} data-testid={isYou ? 'seat-you' : 'seat-opponent'} className={['table-seat-chip absolute max-w-[34%] rounded-full border px-2 py-1 text-[10px]', classes[positions.get(player.id) ?? 'top'], speaking ? 'ring-2 ring-emerald-400' : '', isTurn ? 'border-[var(--theme-brass)] bg-[var(--theme-brass)]/15 text-[var(--theme-brass)]' : 'border-white/15 bg-black/55 text-[var(--theme-text)]'].join(' ')}>
            <span className="font-medium">{speaking ? <span aria-label="Speaking" className="mr-1">●</span> : null}{player.name}{isYou ? <span className="sr-only"> (you)</span> : null}</span>
            <span className="ml-1 font-mono text-[10px] text-[var(--theme-muted)]">· {player.handCount}</span>
            {isTurn ? <span className="ml-1 text-[8px] font-semibold uppercase">turn</span> : null}
          </div>
        );
      })}
    </div>
  );
}
