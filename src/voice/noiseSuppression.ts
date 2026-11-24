export interface NoiseSuppression {
  readonly active: boolean;
  readonly stream: MediaStream;
  dispose(): void;
}
const registered = new WeakMap<AudioContext, Promise<void>>();
export async function enableNoiseSuppression(
  context: AudioContext,
  stream: MediaStream,
): Promise<NoiseSuppression> {
  if (context.sampleRate !== 48000 || !context.audioWorklet)
    return { active: false, stream, dispose() {} };
  try {
    let registration = registered.get(context);
    if (!registration) {
      registration = context.audioWorklet.addModule('/voice/rnnoise-worklet.js');
      registered.set(context, registration);
    }
    await registration;
    const source = context.createMediaStreamSource(stream);
    const processor = new AudioWorkletNode(context, 'rnnoise-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    const destination = context.createMediaStreamDestination();
    const dispose = () => {
      processor.port.postMessage('dispose');
      source.disconnect();
      processor.disconnect();
      destination.disconnect();
      destination.stream.getTracks().forEach((track) => track.stop());
    };
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('RNNoise initialization timed out')),
          5000,
        );
        processor.onprocessorerror = () => {
          clearTimeout(timeout);
          reject(new Error('RNNoise initialization failed'));
        };
        processor.port.onmessage = ({ data }) => {
          if (data === 'ready') {
            clearTimeout(timeout);
            resolve();
          }
        };
      });
    } catch {
      dispose();
      return { active: false, stream, dispose() {} };
    }
    source.connect(processor);
    processor.connect(destination);
    return {
      active: true,
      stream: destination.stream,
      dispose,
    };
  } catch {
    registered.delete(context);
    return { active: false, stream, dispose() {} };
  }
}
