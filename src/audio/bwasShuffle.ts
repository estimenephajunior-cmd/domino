import { Howl } from 'howler';
import { BWAS_MIX_MS } from '../../shared/moves';

let shuffle: Howl | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;

function recording(): Howl {
  shuffle ??= new Howl({
    src: ['/audio/domino-shuffle.mp3'],
    html5: true,
    preload: true,
    volume: 0.65,
  });
  return shuffle;
}

/** Play only the portion matching the server-authoritative Bwas window. */
export function playBwasShuffle(mixingEndsAt: number): () => void {
  const remaining = Math.max(0, mixingEndsAt - Date.now());
  if (remaining === 0) return () => {};
  const sound = recording();
  if (stopTimer) clearTimeout(stopTimer);
  sound.stop();
  const id = sound.play();
  const elapsedSeconds = Math.max(0, BWAS_MIX_MS - remaining) / 1000;
  sound.seek(elapsedSeconds, id);
  stopTimer = setTimeout(() => {
    sound.stop(id);
    stopTimer = null;
  }, remaining);
  return () => {
    if (stopTimer) clearTimeout(stopTimer);
    stopTimer = null;
    sound.stop(id);
  };
}
