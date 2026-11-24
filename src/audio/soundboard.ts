import { Howl } from 'howler';
import type { SoundEffectId } from '../../shared/social';
import { synthesizeEffect } from './effects';
import { encodeWav } from './wav';

const sounds = new Map<SoundEffectId, Howl>();

function sound(id: SoundEffectId): Howl {
  const cached = sounds.get(id);
  if (cached) return cached;
  const created = new Howl({ src: [encodeWav(synthesizeEffect(id))], html5: false, preload: true });
  sounds.set(id, created);
  return created;
}

export function playSoundboardEffect(id: SoundEffectId, volume: number): void {
  const effect = sound(id);
  effect.volume(Math.min(1, Math.max(0, volume)));
  effect.play();
}

export function unloadSoundboard(): void {
  for (const effect of sounds.values()) effect.unload();
  sounds.clear();
}
