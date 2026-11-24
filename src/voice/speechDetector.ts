/**
 * Voice activity detection.
 *
 * The Silero VAD model runs in an `AudioWorklet` inside the browser. It tells
 * the voice controls whether the player is actually speaking, which drives
 * the automatic transmit mode.
 *
 * The model is loaded lazily and the detector degrades gracefully: if the
 * model cannot be loaded, the caller simply never sees speech detected and
 * push-to-talk still works.
 */
import type { MicVAD } from '@ricky0123/vad-web';

/**
 * The speech probability the VAD reports for a frame.
 *
 * Only the speech probability is used here, so the callback is typed with the
 * subset of the VAD's own probability shape that this module relies on.
 */
interface FrameProbabilities {
  readonly isSpeech: number;
}

/** A speech detector that reports whether the player is speaking. */
export interface SpeechDetector {
  /** True while the detector sees speech. */
  readonly speaking: boolean;
  readonly kind?: 'neural' | 'energy';
  /** Start listening. */
  start(): Promise<void>;
  /** Stop listening and release the resources. */
  stop(): Promise<void>;
}

/** The options for building a detector. */
export interface SpeechDetectorOptions {
  /** The microphone stream to listen to. */
  readonly stream: MediaStream;
  readonly context: AudioContext;
  /** Called whenever the speaking state changes. */
  readonly onChange: (speaking: boolean) => void;
}

/**
 * Build a speech detector.
 *
 * The VAD needs the microphone stream, so the detector is created only once
 * the microphone has been granted.
 */
export async function createSpeechDetector(
  options: SpeechDetectorOptions,
): Promise<SpeechDetector> {
  let speaking = false;
  let vad: Awaited<ReturnType<typeof MicVAD.new>> | null = null;

  const setSpeaking = (next: boolean) => {
    if (speaking === next) return;
    speaking = next;
    options.onChange(next);
  };

  try {
    const { MicVAD } = await import('@ricky0123/vad-web');
    vad = await MicVAD.new({
      ortConfig: (ort) => {
        ort.env.wasm.numThreads = 1;
      },
      audioContext: options.context,
      model: 'v5',
      pauseStream: async () => {},
      resumeStream: async () => options.stream,
      getStream: async () => options.stream,
      startOnLoad: false,
      // The onnxruntime WASM binaries are served from the app's own origin.
      onnxWASMBasePath: '/voice/',
      baseAssetPath: '/voice/',
      onSpeechStart: () => setSpeaking(true),
      onSpeechEnd: () => setSpeaking(false),
      onVADMisfire: () => setSpeaking(false),
      onSpeechRealStart: () => setSpeaking(true),
      onFrameProcessed: (probabilities: FrameProbabilities) => {
        // A high probability outside the speech callbacks (the hangover
        // window) also counts as speech.
        if (probabilities.isSpeech >= 0.85) setSpeaking(true);
      },
    });
  } catch {
    // The model could not be loaded; push-to-talk remains usable.
    return createEnergyDetector(options.context, options.stream, options.onChange);
  }

  return {
    kind: 'neural',
    get speaking() {
      return speaking;
    },
    async start() {
      await vad?.start();
      if (vad?.errored) throw new Error(vad.errored);
    },
    async stop() {
      try {
        await vad?.destroy();
      } catch {
        // Nothing to do; the worklet is already gone.
      }
      setSpeaking(false);
    },
  };
}

/**
 * A simple energy-based detector, used when the neural model is unavailable.
 *
 * It is less accurate than the model but keeps the automatic mode usable.
 */
export function createEnergyDetector(
  context: AudioContext,
  stream: MediaStream,
  onChange: (speaking: boolean) => void,
): SpeechDetector {
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let speaking = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const poll = () => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    const rms = Math.sqrt(sum / samples.length);
    // A rough speech threshold; above this the player is probably talking.
    const next = rms > 0.02;
    if (next !== speaking) {
      speaking = next;
      onChange(next);
    }
  };

  return {
    get speaking() {
      return speaking;
    },
    kind: 'energy',
    async start() {
      timer ??= setInterval(poll, 100);
      poll();
    },
    async stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
      source.disconnect();
      analyser.disconnect();
      if (speaking) {
        speaking = false;
        onChange(false);
      }
    },
  };
}
