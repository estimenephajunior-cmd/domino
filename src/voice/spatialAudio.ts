import { listenerPoint, playbackGain, type TablePosition } from '../../shared/voice';
export interface SpatialSpeaker {
  readonly id: string;
  readonly position: TablePosition;
  readonly volume: number;
  readonly muted: boolean;
}
export function connectRemoteStream(
  context: AudioContext,
  stream: MediaStream,
  speaker: SpatialSpeaker,
  onSpeaking: (active: boolean) => void,
) {
  // Chromium needs a media element to pull remote RTC audio into Web Audio.
  // It stays muted: the HRTF graph below is the only audible playback path.
  const playback = typeof Audio === 'function' ? new Audio() : null;
  if (playback) {
    playback.muted = true;
    playback.srcObject = stream;
    void playback.play().catch(() => undefined);
  }
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  const panner = context.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 1;
  const gain = context.createGain();
  source.connect(analyser);
  analyser.connect(panner);
  panner.connect(gain);
  gain.connect(context.destination);
  let config = speaker;
  let speaking = false;
  const update = (next: SpatialSpeaker) => {
    config = next;
    const point = listenerPoint(next.position);
    panner.positionX.value = point.x;
    panner.positionY.value = point.y;
    panner.positionZ.value = point.z;
    gain.gain.setValueAtTime(playbackGain(next.volume, next.muted), context.currentTime);
  };
  update(speaker);
  const samples = new Float32Array(analyser.fftSize);
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    const next = rms > 0.015 && !config.muted && config.volume > 0;
    if (next !== speaking) {
      speaking = next;
      onSpeaking(next);
    }
  }, 80);
  return {
    panner,
    gain,
    update,
    dispose() {
      playback?.pause();
      if (playback) playback.srcObject = null;
      clearInterval(timer);
      source.disconnect();
      analyser.disconnect();
      panner.disconnect();
      gain.disconnect();
      if (speaking) onSpeaking(false);
    },
  };
}
