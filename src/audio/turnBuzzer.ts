import type { Howl } from 'howler';

let cachedBuzzer: Promise<Howl> | null = null;

/** One decoded sound is reused for every deadline, with no network audio dependency. */
function buzzerSource(): string {
  const sampleRate = 16000;
  const count = 3200;
  const bytes = new Uint8Array(44 + count * 2);
  const data = new DataView(bytes.buffer);
  const label = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++)
      bytes[offset + index] = value.charCodeAt(index);
  };
  label(0, 'RIFF');
  data.setUint32(4, bytes.length - 8, true);
  label(8, 'WAVE');
  label(12, 'fmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, 1, true);
  data.setUint32(24, sampleRate, true);
  data.setUint32(28, sampleRate * 2, true);
  data.setUint16(32, 2, true);
  data.setUint16(34, 16, true);
  label(36, 'data');
  data.setUint32(40, count * 2, true);
  for (let index = 0; index < count; index++) {
    const envelope = Math.min(1, index / 120) * Math.min(1, (count - index) / 500);
    data.setInt16(
      44 + index * 2,
      Math.sin((index / sampleRate) * Math.PI * 2 * 440) * envelope * 9000,
      true,
    );
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export async function playTurnBuzzer(): Promise<void> {
  try {
    cachedBuzzer ??= import('howler').then(
      ({ Howl }) => new Howl({ src: [buzzerSource()], format: ['wav'], volume: 0.35 }),
    );
    (await cachedBuzzer).play();
  } catch {
    // Audio is optional; autoplay restrictions must not interfere with the turn.
    cachedBuzzer = null;
  }
}
