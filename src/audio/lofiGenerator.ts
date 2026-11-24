export interface LofiPlayer {
  start(): Promise<void>;
  stop(): void;
  setVolume(level: number): void;
  dispose(): void;
}

/** Lazy Tone.js lofi loop; no samples or network assets are required. */
export async function createLofiPlayer(level: number): Promise<LofiPlayer> {
  const Tone = await import('tone');
  const output = new Tone.Volume(-40).toDestination();
  const filter = new Tone.Filter({ frequency: 1450, type: 'lowpass', rolloff: -24 }).connect(output);
  const keys = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.04, decay: 0.35, sustain: 0.18, release: 1.2 },
  }).connect(filter);
  const bass = new Tone.MonoSynth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.03, decay: 0.25, sustain: 0.25, release: 0.7 },
  }).connect(filter);
  const kick = new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 3 }).connect(output);
  const snare = new Tone.NoiseSynth({
    noise: { type: 'brown' },
    envelope: { attack: 0.005, decay: 0.13, sustain: 0 },
  }).connect(output);
  const crackleGain = new Tone.Gain(0.012).connect(output);
  const crackle = new Tone.Noise('pink').connect(crackleGain);
  const chords = [
    ['D3', 'F3', 'A3', 'C4', 'E4'],
    ['G2', 'B2', 'D3', 'F3', 'E4'],
    ['C3', 'E3', 'G3', 'B3', 'D4'],
    ['A2', 'C3', 'E3', 'G3', 'A#3'],
  ];
  const roots = ['D2', 'G1', 'C2', 'A1'];
  let step = 0;
  const loop = new Tone.Loop((time) => {
    const index = step++ % chords.length;
    keys.triggerAttackRelease(chords[index]!, '1m', time, 0.22);
    bass.triggerAttackRelease(roots[index]!, '2n', time, 0.32);
  }, '1m');
  let beat = 0;
  const drums = new Tone.Loop((time) => {
    if (beat % 4 === 0 || beat % 4 === 2) kick.triggerAttackRelease('C1', '8n', time, 0.35);
    if (beat % 4 === 1 || beat % 4 === 3) snare.triggerAttackRelease('16n', time, 0.18);
    beat += 1;
  }, '4n');
  Tone.getTransport().bpm.value = 75;
  const db = (value: number) => (value <= 0 ? -60 : -36 + value * 30);
  output.volume.value = db(level);
  let running = false;
  return {
    async start() {
      await Tone.start();
      if (running) return;
      running = true;
      loop.start(0);
      drums.start(0);
      crackle.start();
      Tone.getTransport().start();
    },
    stop() {
      if (!running) return;
      running = false;
      loop.stop();
      drums.stop();
      crackle.stop();
      keys.releaseAll();
    },
    setVolume(next) {
      output.volume.rampTo(db(Math.min(1, Math.max(0, next))), 0.08);
    },
    dispose() {
      loop.dispose();
      drums.dispose();
      keys.dispose();
      bass.dispose();
      kick.dispose();
      snare.dispose();
      crackle.dispose();
      crackleGain.dispose();
      filter.dispose();
      output.dispose();
    },
  };
}
