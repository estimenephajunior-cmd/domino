import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTableStore } from '../state/tableStore';
import { playTurnBuzzer } from '../audio/turnBuzzer';
import { Undo2, Volume2, VolumeX } from 'lucide-react';

function useServerTime(serverNow: number): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const started = performance.now();
    const timer = setInterval(() => setNow(serverNow + performance.now() - started), 100);
    return () => clearInterval(timer);
  }, [serverNow]);
  return now;
}

export function PhaseFivePanel() {
  const view = useTableStore((state) => state.view);
  const playerId = useTableStore((state) => state.playerId);
  const connected = useTableStore((state) => state.connected);
  const requestUndo = useTableStore((state) => state.requestUndo);
  const voteUndo = useTableStore((state) => state.voteUndo);
  const [sound, setSound] = useState(true);
  const feature = view?.phaseFive;
  const now = useServerTime(feature?.serverNow ?? 0);
  const lastTimeout = useRef(feature?.timeoutSequence ?? 0);
  useEffect(() => {
    const sequence = feature?.timeoutSequence ?? 0;
    if (sequence > lastTimeout.current && sound) void playTurnBuzzer();
    lastTimeout.current = sequence;
  }, [feature?.timeoutSequence, sound]);
  if (!feature || !view || (view.phase !== 'awaiting-play' && view.phase !== 'hand-complete'))
    return null;
  const vote = feature.undo.vote;
  const eligible = vote?.eligible.includes(playerId ?? '') === true;
  const voted = vote && [...vote.yes, ...vote.no].includes(playerId ?? '');
  const remaining = (deadline: number) => Math.max(0, Math.ceil((deadline - now) / 1000));
  const canRequest =
    connected &&
    feature.undo.availableFor === playerId &&
    feature.undo.requestExpiresAt !== null &&
    now < feature.undo.requestExpiresAt;
  return (
    <section
      data-testid="phase-five-controls"
      aria-label="Turn rules and undo"
      className="phase-five-compact"
    >
      {feature.mutators.speed && (
        <span data-testid="speed-clock" role="timer">
          {vote ? 'Clock paused for vote' : `Turn: ${remaining(feature.turnDeadline ?? now)}s`}
        </span>
      )}
      {feature.mutators.wildDouble && <span>Wild Double</span>}
      {feature.mutators.hotPotato && <span>Hot Potato</span>}
      <button
        type="button"
        aria-label="Request undo"
        title="Request undo"
        disabled={!canRequest}
        onClick={requestUndo}
        className="table-icon-button disabled:opacity-30"
      >
        <Undo2 size={17} />
      </button>
      {feature.undo.result && <span role="status">Undo {feature.undo.result}</span>}
      {feature.mutators.speed && (
        <button
          type="button"
          aria-pressed={sound}
          onClick={() => setSound((enabled) => !enabled)}
          className="table-icon-button"
          aria-label={sound ? 'Mute turn buzzer' : 'Enable turn buzzer'}
        >
          {sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>
      )}
      <Dialog.Root open={vote !== null}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/65" />
          <Dialog.Content
            onEscapeKeyDown={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
            className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#D4AF37]/50 bg-slate-950 p-6 text-slate-100 shadow-xl"
          >
            <Dialog.Title className="text-lg font-semibold">Undo the last placement?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-slate-400">
              {view.players.find((player) => player.id === vote?.requesterId)?.name ?? 'A player'}{' '}
              requested a rollback. Moves and the turn clock are paused.
            </Dialog.Description>
            {vote && (
              <>
                <p className="my-3" role="status">
                  {vote.yes.length} yes, {vote.no.length} no.{' '}
                  {Math.floor(vote.eligible.length / 2) + 1} yes votes needed.{' '}
                  {remaining(vote.expiresAt)}s left.
                </p>
                {voted ? (
                  <p>Your vote is recorded.</p>
                ) : (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={!eligible || !connected}
                      onClick={() => voteUndo(vote.id, true)}
                      className="rounded bg-[#D4AF37] px-4 py-2 font-semibold text-slate-950"
                    >
                      Approve undo
                    </button>
                    <button
                      type="button"
                      disabled={!eligible || !connected}
                      onClick={() => voteUndo(vote.id, false)}
                      className="rounded border border-slate-500 px-4 py-2"
                    >
                      Reject undo
                    </button>
                  </div>
                )}
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
