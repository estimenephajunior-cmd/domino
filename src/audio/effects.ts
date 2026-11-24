/**
 * The eight soundboard effects, synthesised from scratch.
 *
 * Each effect is a pure function from a seed to a PCM buffer, so the same
 * effect always sounds the same and no audio assets need shipping.
 */
import type { SoundEffectId } from '../../shared/social';
import { createRandom, render, SYNTH_SAMPLE_RATE } from './wav';

const TWO_PI = Math.PI * 2;

/** Add an exponential decay envelope in place. */
function decay(samples: Float32Array, rate: number): void {
  const length = samples.length;
  for (let index = 0; index < length; index += 1) {
    samples[index] = samples[index]! * Math.exp((-index / length) * rate);
  }
}

/** Normalise the buffer so every effect plays at a comparable loudness. */
function normalize(samples: Float32Array, peak = 0.85): void {
  let max = 0;
  for (const sample of samples) max = Math.max(max, Math.abs(sample));
  if (max === 0) return;
  const scale = peak / max;
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = samples[index]! * scale;
  }
}

/** Filtered noise: a one-pole low-pass over white noise. */
function noise(samples: Float32Array, random: () => number, cutoff: number): void {
  const alpha = Math.min(1, Math.max(0.01, cutoff));
  let previous = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const white = random() * 2 - 1;
    previous += alpha * (white - previous);
    samples[index] = previous;
  }
}

/** Mix a source into the buffer at a position, clamped to the end. */
function mixAt(samples: Float32Array, start: number, value: number): void {
  if (start < 0 || start >= samples.length) return;
  samples[start] = samples[start]! + value;
}

/** Applause: a swelling crowd of claps, built from decaying noise bursts. */
function applause(random: () => number): Float32Array {
  const samples = render(1.5);
  for (let clap = 0; clap < 130; clap += 1) {
    const start = Math.floor(random() * samples.length * 0.85);
    const length = Math.floor(SYNTH_SAMPLE_RATE * (0.02 + random() * 0.03));
    const loud = 0.4 + random() * 0.6;
    for (let index = 0; index < length; index += 1) {
      const t = index / SYNTH_SAMPLE_RATE;
      const env = Math.exp(-t * 70);
      mixAt(samples, start + index, (random() * 2 - 1) * env * loud * 0.5);
    }
  }
  noise(samples, random, 0.55);
  for (let index = 0; index < samples.length; index += 1) {
    const progress = index / samples.length;
    samples[index] = samples[index]! * Math.min(1, progress * 6) * (1 - progress);
  }
  return samples;
}

/** Laugh: a wobbling formant burst with a falling pitch. */
function laugh(random: () => number): Float32Array {
  const samples = render(0.85);
  for (let index = 0; index < samples.length; index += 1) {
    const t = index / SYNTH_SAMPLE_RATE;
    const progress = index / samples.length;
    const pulse = Math.sin(TWO_PI * 7.5 * t) * Math.sin(TWO_PI * 7.5 * t + 0.6);
    const pitch = 210 + 40 * Math.sin(TWO_PI * 3.1 * t) - 70 * progress;
    const formant = Math.sin(TWO_PI * pitch * t) * 0.7 + Math.sin(TWO_PI * pitch * 2.4 * t) * 0.3;
    samples[index] = (formant * 0.8 + pulse * 0.4) * (random() * 2 - 1) * 0.4;
  }
  decay(samples, 2.4);
  return samples;
}

/** Boo: a low, buzzing groan that drifts downward. */
function boo(random: () => number): Float32Array {
  const samples = render(1.1);
  for (let index = 0; index < samples.length; index += 1) {
    const t = index / SYNTH_SAMPLE_RATE;
    const progress = index / samples.length;
    const pitch = 165 - 45 * progress + 8 * Math.sin(TWO_PI * 5.5 * t);
    const buzz = Math.sin(TWO_PI * pitch * t) + 0.5 * Math.sin(TWO_PI * pitch * 2 * t);
    samples[index] = buzz * 0.5 + (random() * 2 - 1) * 0.12;
  }
  const attack = Math.floor(samples.length * 0.08);
  for (let index = 0; index < attack; index += 1) {
    samples[index] = samples[index]! * (index / attack);
  }
  decay(samples, 1.6);
  return samples;
}

/** Gasp: a sharp inhale that rises and breaks off. */
function gasp(random: () => number): Float32Array {
  const samples = render(0.7);
  for (let index = 0; index < samples.length; index += 1) {
    const t = index / SYNTH_SAMPLE_RATE;
    const progress = index / samples.length;
    const pitch = 420 + 500 * progress;
    const breath = (random() * 2 - 1) * 0.7;
    const tone = Math.sin(TWO_PI * pitch * t) * 0.35;
    samples[index] = (breath * 0.6 + tone) * Math.sin(Math.PI * Math.min(1, progress * 1.05));
  }
  decay(samples, 1.1);
  return samples;
}

/** Whistle: a two-tone referee whistle with a breathy edge. */
function whistle(random: () => number): Float32Array {
  const samples = render(0.6);
  for (let index = 0; index < samples.length; index += 1) {
    const t = index / SYNTH_SAMPLE_RATE;
    const progress = index / samples.length;
    const pitch = 2150 + 350 * progress + 40 * Math.sin(TWO_PI * 18 * t);
    const trill = 1 + 0.02 * Math.sin(TWO_PI * 32 * t);
    const body = Math.sin(TWO_PI * pitch * trill * t);
    samples[index] = body * 0.55 + (random() * 2 - 1) * 0.18;
  }
  const attack = Math.floor(samples.length * 0.04);
  for (let index = 0; index < attack; index += 1) {
    samples[index] = samples[index]! * (index / attack);
  }
  decay(samples, 1.8);
  return samples;
}

/** Gong: a metallic hit built from inharmonic partials. */
function gong(random: () => number): Float32Array {
  const samples = render(2.2);
  const partials = [1, 2.41, 3.77, 5.19, 7.02, 9.4];
  for (let index = 0; index < samples.length; index += 1) {
    const t = index / SYNTH_SAMPLE_RATE;
    let value = 0;
    for (let part = 0; part < partials.length; part += 1) {
      const frequency = 168 * partials[part]!;
      value += Math.sin(TWO_PI * frequency * t) / (part + 1.4);
    }
    samples[index] = value * 0.5 + (random() * 2 - 1) * 0.05;
  }
  decay(samples, 2.8);
  return samples;
}

/** Dice: a handful of tiles rattling in a cup. */
function dice(random: () => number): Float32Array {
  const samples = render(1.0);
  for (let knock = 0; knock < 26; knock += 1) {
    const start = Math.floor(random() * samples.length * 0.8);
    const length = Math.floor(SYNTH_SAMPLE_RATE * 0.05);
    const pitch = 900 + random() * 1600;
    for (let index = 0; index < length; index += 1) {
      const t = index / SYNTH_SAMPLE_RATE;
      const env = Math.exp(-t * 90);
      const click = Math.sin(TWO_PI * pitch * t) * 0.6 + (random() * 2 - 1) * 0.4;
      mixAt(samples, start + index, click * env * 0.5);
    }
  }
  decay(samples, 1.4);
  return samples;
}

/** Cheer: a stadium swell of overlapping voices. */
function cheer(random: () => number): Float32Array {
  const samples = render(1.8);
  for (let voice = 0; voice < 22; voice += 1) {
    const pitch = 180 + random() * 260;
    const start = Math.floor(random() * samples.length * 0.45);
    const length = Math.floor(SYNTH_SAMPLE_RATE * (0.5 + random() * 0.9));
    const wobbleRate = 4 + random() * 3;
    for (let index = 0; index < length; index += 1) {
      const t = index / SYNTH_SAMPLE_RATE;
      const wobble = 1 + 0.06 * Math.sin(TWO_PI * wobbleRate * t);
      const env = Math.min(1, t * 8) * Math.exp(-t * 2.4);
      mixAt(samples, start + index, Math.sin(TWO_PI * pitch * wobble * t) * env * 0.08);
    }
  }
  noise(samples, random, 0.4);
  for (let index = 0; index < samples.length; index += 1) {
    const progress = index / samples.length;
    samples[index] = samples[index]! * Math.min(1, progress * 4) * (1 - progress * 0.55);
  }
  return samples;
}

/** The synthesiser for every effect. */
const SYNTHESISERS: Record<SoundEffectId, (random: () => number) => Float32Array> = {
  applause,
  laugh,
  boo,
  gasp,
  whistle,
  gong,
  dice,
  cheer,
};

/** A stable seed per effect, so a given effect always sounds identical. */
const SEEDS: Record<SoundEffectId, number> = {
  applause: 0x51f3,
  laugh: 0x2a71,
  boo: 0x7c19,
  gasp: 0x13d5,
  whistle: 0x9ab2,
  gong: 0x4e08,
  dice: 0x6f27,
  cheer: 0x38c4,
};

/** Synthesise one effect into PCM samples. */
export function synthesizeEffect(id: SoundEffectId): Float32Array {
  const samples = SYNTHESISERS[id](createRandom(SEEDS[id]));
  normalize(samples);
  return samples;
}
