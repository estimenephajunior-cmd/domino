/**
 * A minimal PCM/WAV encoder.
 *
 * The soundboard effects are synthesised in the browser rather than shipped
 * as audio files, so they need a way to become a decodable buffer. Howler
 * accepts a data URL, which this module produces.
 */

const SAMPLE_RATE = 22_050;

/** Encode mono float samples as a 16-bit PCM WAV data URL. */
export function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): string {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/** The sample rate the synthesiser renders at. */
export const SYNTH_SAMPLE_RATE = SAMPLE_RATE;

/** A deterministic pseudo-random generator, so a sound is always identical. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

/** Render `seconds` of audio at the synthesiser's sample rate. */
export function render(seconds: number): Float32Array {
  return new Float32Array(Math.max(1, Math.round(seconds * SYNTH_SAMPLE_RATE)));
}
