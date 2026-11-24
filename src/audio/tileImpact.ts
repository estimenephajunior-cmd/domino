import type { Howl } from 'howler';
let cached: Promise<Howl> | null = null;
export async function playTileImpact(intensity: number): Promise<void> {
  try {
    cached ??= import('howler').then(({ Howl }) => {
      const count = 6000;
      const bytes = new Uint8Array(44 + count * 2);
      const data = new DataView(bytes.buffer);
      const text = (at: number, value: string) =>
        [...value].forEach((char, i) => data.setUint8(at + i, char.charCodeAt(0)));
      text(0, 'RIFF');
      data.setUint32(4, 36 + count * 2, true);
      text(8, 'WAVE');
      text(12, 'fmt ');
      data.setUint32(16, 16, true);
      data.setUint16(20, 1, true);
      data.setUint16(22, 1, true);
      data.setUint32(24, 48000, true);
      data.setUint32(28, 96000, true);
      data.setUint16(32, 2, true);
      data.setUint16(34, 16, true);
      text(36, 'data');
      data.setUint32(40, count * 2, true);
      for (let i = 0; i < count; i++) {
        const t = i / 48000;
        const sample =
          (Math.sin(2 * Math.PI * 140 * t) + Math.sin(2 * Math.PI * 830 * t) * 0.25) *
          Math.exp(-t * 55);
        data.setInt16(44 + i * 2, Math.round(sample * 18000), true);
      }
      return new Howl({
        src: [`data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`],
        format: ['wav'],
        volume: 0.3,
      });
    });
    const sound = await cached;
    sound.volume(0.15 + intensity * 0.45);
    sound.play();
  } catch {
    cached = null;
  }
}
