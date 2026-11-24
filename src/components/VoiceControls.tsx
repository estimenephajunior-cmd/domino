import { Mic, MicOff, Settings2, Volume2, VolumeX } from 'lucide-react';
import { useTableStore } from '../state/tableStore';
import type { VoiceController } from '../voice/useVoice';

export function VoiceControls({ voice }: { readonly voice: VoiceController }) {
  const room = useTableStore((state) => state.room);
  const playerId = useTableStore((state) => state.playerId);
  const ready = voice.status === 'ready';
  const peerFailure = Object.values(voice.peers).some((peer) => peer.error);
  const statusMessage = voice.error
    ?? (peerFailure ? 'A voice connection is unavailable. Gameplay and text chat still work.' : null);
  const stopTalking = () => voice.setTalking(false);
  return (
    <div data-testid="voice-controls" className="voice-fab-wrap">
      <button
        type="button"
        data-testid={ready ? 'voice-mute' : 'voice-enable'}
        aria-label={ready ? (voice.muted ? 'Unmute microphone' : 'Mute microphone') : 'Enable voice'}
        aria-pressed={ready ? voice.muted : undefined}
        disabled={!voice.supported || voice.status === 'starting'}
        onClick={() => ready ? voice.setMuted(!voice.muted) : void voice.enable()}
        className={`table-fab ${voice.transmitting ? 'is-speaking' : ''}`}
      >
        {ready && voice.muted ? <MicOff size={20} /> : <Mic size={20} />}
      </button>
      {ready ? (
        <details className="voice-settings">
          <summary className="table-fab" aria-label="Voice settings"><Settings2 size={18} /></summary>
          <div className="voice-settings-panel">
            <div className="flex gap-2">
              <button type="button" data-testid="voice-mode-vad" aria-pressed={voice.mode === 'vad'} onClick={() => voice.setMode('vad')}>Voice detect</button>
              <button type="button" data-testid="voice-mode-ptt" aria-pressed={voice.mode === 'ptt'} onClick={() => voice.setMode('ptt')}>Push to talk</button>
            </div>
            {voice.mode === 'ptt' ? (
              <button
                type="button"
                data-testid="voice-ptt"
                className="voice-ptt"
                aria-pressed={voice.talking}
                onPointerDown={(event) => {
                  try {
                    event.currentTarget.setPointerCapture(event.pointerId);
                  } catch {
                    // Synthetic accessibility activation has no active pointer.
                  }
                  voice.setTalking(true);
                }}
                onPointerUp={stopTalking}
                onPointerCancel={stopTalking}
                onLostPointerCapture={stopTalking}
                onKeyDown={(event) => {
                  if (event.code === 'Space' || event.code === 'Enter') voice.setTalking(true);
                }}
                onKeyUp={stopTalking}
                onBlur={stopTalking}
              >
                {voice.talking ? 'Talking… release to stop' : 'Hold to talk'}
              </button>
            ) : null}
            <button type="button" data-testid="voice-noise" aria-pressed={voice.noise === 'active'} onClick={() => void voice.toggleNoise()}>
              {voice.noise === 'active' ? 'RNNoise on' : voice.noise === 'loading' ? 'Loading noise filter…' : voice.noise === 'fallback' ? 'Basic noise filter' : 'Noise filter'}
            </button>
            <span className="sr-only" data-testid="voice-detector">{voice.detectorKind}</span>
            {room?.seats.filter((seat) => seat.id !== playerId).map((seat) => {
              const peer = voice.peers[seat.id];
              const muted = peer?.muted === true;
              return (
                <div
                  key={seat.id}
                  className="voice-peer"
                  data-testid={`voice-peer-${seat.id}`}
                  data-connection={peer?.connection ?? 'off'}
                  data-speaking={peer?.speaking === true}
                >
                  <span className="voice-peer-name">
                    <i aria-hidden="true" />
                    {seat.name}
                  </span>
                  <button
                    type="button"
                    aria-label={`${muted ? 'Unmute' : 'Mute'} ${seat.name}`}
                    aria-pressed={muted}
                    onClick={() => voice.setPeer(seat.id, { muted: !muted })}
                  >
                    {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    aria-label={`Volume for ${seat.name}`}
                    value={peer?.volume ?? 1}
                    onChange={(event) => voice.setPeer(seat.id, { volume: Number(event.target.value) })}
                  />
                  <span className="sr-only">
                    {peer?.connection === 'connected' ? 'voice connected' : 'voice off'}
                  </span>
                </div>
              );
            })}
            <button type="button" data-testid="voice-disable" onClick={voice.disable}>Leave voice</button>
          </div>
        </details>
      ) : null}
      <span className={statusMessage ? 'voice-status-toast' : 'sr-only'} role="status">
        {statusMessage ?? (!voice.supported ? 'Voice unavailable' : voice.status)}
      </span>
      <span className="sr-only" data-testid="voice-local-activity" data-speaking={voice.transmitting}>{voice.transmitting ? 'Transmitting' : 'Mic quiet'}</span>
    </div>
  );
}
