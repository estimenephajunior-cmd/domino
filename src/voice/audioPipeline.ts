import { shouldTransmit, type VoiceMode, type VoiceUnavailableReason } from '../../shared/voice';
export async function requestMicrophone(): Promise<{
  stream: MediaStream | null;
  error: VoiceUnavailableReason | null;
}> {
  if (!navigator.mediaDevices?.getUserMedia) return { stream: null, error: 'no-microphone' };
  try {
    return {
      stream: await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48000 },
          latency: { ideal: 0 },
        } as MediaTrackConstraints,
        video: false,
      }),
      error: null,
    };
  } catch (error) {
    return { stream: null, error: classifyMediaError(error) };
  }
}
export function classifyMediaError(error: unknown): VoiceUnavailableReason {
  const name = error instanceof Error ? error.name : '';
  return name === 'NotAllowedError' || name === 'SecurityError'
    ? 'permission-denied'
    : name === 'NotFoundError' || name === 'OverconstrainedError'
      ? 'no-microphone'
      : 'unknown';
}
export interface AudioPipelineOptions {
  mode: VoiceMode;
  talking: boolean;
  detectedSpeech: boolean;
  muted: boolean;
}
export interface AudioPipeline {
  readonly track: MediaStreamTrack;
  readonly transmitting: boolean;
  readonly context: AudioContext;
  update(next: Partial<AudioPipelineOptions>): void;
  setInput(stream: MediaStream): void;
  dispose(): void;
}
export function createAudioPipeline(
  stream: MediaStream,
  options: AudioPipelineOptions,
): AudioPipeline {
  const context = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  const destination = context.createMediaStreamDestination();
  const gain = context.createGain();
  let source = context.createMediaStreamSource(stream);
  source.connect(gain);
  gain.connect(destination);
  const track = destination.stream.getAudioTracks()[0]!;
  const state = { ...options };
  const apply = () => {
    const active = shouldTransmit(state);
    gain.gain.setValueAtTime(active ? 1 : 0, context.currentTime);
    track.enabled = active;
  };
  apply();
  return {
    context,
    track,
    get transmitting() {
      return shouldTransmit(state);
    },
    update(next) {
      Object.assign(state, next);
      apply();
    },
    setInput(next) {
      source.disconnect();
      source = context.createMediaStreamSource(next);
      source.connect(gain);
    },
    dispose() {
      source.disconnect();
      gain.disconnect();
      destination.disconnect();
      for (const item of [...stream.getTracks(), ...destination.stream.getTracks()]) item.stop();
      void context.close().catch(() => undefined);
    },
  };
}
