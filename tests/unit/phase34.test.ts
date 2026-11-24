/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { layoutChain } from '../../shared/board';
import { chainEnds, resolveSnap } from '../../shared/drag';
import { judgeSlam } from '../../shared/slam';
import { listenerPoint, playbackGain, shouldTransmit, voiceSupport } from '../../shared/voice';
import { relativePositions } from '../../shared/seats';
import type { Chain, PlacedTile } from '../../shared/types';
import { RecoilWorld } from '../../src/board/RecoilWorld';
import { createAudioPipeline, classifyMediaError } from '../../src/voice/audioPipeline';
import { connectRemoteStream } from '../../src/voice/spatialAudio';
import { parseSignal, shouldOffer } from '../../src/voice/signaling';

const tile = (id: string): PlacedTile => ({ id, low: 2, high: 3, left: 2, right: 3 });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('physical board', () => {
  it('keeps a large four-arm spinner layout free of overlapping footprints on resize', () => {
    const tiles = Array.from({ length: 25 }, (_, i) => tile(`main${i}`));
    const spinner = { ...tile('spinner'), low: 3, high: 3, left: 3, right: 3 };
    tiles[12] = spinner;
    const chain: Chain = {
      tiles,
      spinner,
      leftEnd: 2,
      rightEnd: 3,
      branches: {
        top: Array.from({ length: 10 }, (_, i) => tile(`top${i}`)),
        bottom: Array.from({ length: 10 }, (_, i) => tile(`bottom${i}`)),
      },
    };
    for (const tilesPerRow of [1, 3, 6, 12]) {
      const slots = layoutChain(chain, { tilesPerRow });
      expect(slots).toHaveLength(45);
      for (let a = 0; a < slots.length; a++)
        for (let b = a + 1; b < slots.length; b++) {
          const one = slots[a]!;
          const two = slots[b]!;
          expect(
            Math.abs(one.x - two.x) >= (one.width + two.width) / 2 ||
              Math.abs(one.y - two.y) >= (one.height + two.height) / 2,
          ).toBe(true);
        }
      expect(chainEnds(chain, { tilesPerRow }).map((end) => end.end)).toEqual([
        'left',
        'right',
        'top',
        'bottom',
      ]);
    }
  });
  it('uses screen pixels for magnet distance after zooming', () => {
    const chain: Chain = { tiles: [tile('tile')], spinner: null, leftEnd: 2, rightEnd: 3 };
    const end = chainEnds(chain)[1]!;
    expect(
      resolveSnap(
        tile('play'),
        chain,
        { x: end.x + 70, y: end.y },
        { legalEnds: ['right'], zoom: 0.5 },
      ).snapped,
    ).toBe(true);
    expect(
      resolveSnap(
        tile('play'),
        chain,
        { x: end.x + 25, y: end.y },
        { legalEnds: ['right'], zoom: 2 },
      ).snapped,
    ).toBe(false);
  });
  it('steps recoil back to its homes and updates those homes after reflow', () => {
    const world = new RecoilWorld();
    const tiles = [tile('a'), tile('b')];
    world.sync(
      tiles,
      new Map([
        ['a', { x: 0, y: 0 }],
        ['b', { x: 100, y: 0 }],
      ]),
    );
    world.slam(judgeSlam({ velocity: 3, isDouble: true, isWinning: false }), { x: 0, y: 0 });
    world.step();
    expect(world.positionOf('b').x).toBeGreaterThan(100);
    for (let i = 0; i < 300; i++) world.step();
    expect(world.positionOf('b')).toEqual({ x: 100, y: 0 });
    expect(world.isRunning).toBe(false);
    world.sync(
      tiles,
      new Map([
        ['a', { x: 0, y: 0 }],
        ['b', { x: -100, y: 100 }],
      ]),
    );
    expect(world.positionOf('b')).toEqual({ x: -100, y: 100 });
    world.clear();
    expect(world.size).toBe(0);
  });
});

function audioFixture() {
  const raw = { enabled: true, stop: vi.fn() };
  const outgoing = { enabled: true, stop: vi.fn() };
  const stream = { getAudioTracks: () => [raw], getTracks: () => [raw] } as unknown as MediaStream;
  const param = { value: 1, setValueAtTime: vi.fn() };
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const source = node();
  const gain = { ...node(), gain: param };
  const destination = {
    ...node(),
    stream: { getAudioTracks: () => [outgoing], getTracks: () => [outgoing] },
  };
  const panner = {
    ...node(),
    panningModel: '',
    positionX: { value: 0 },
    positionY: { value: 0 },
    positionZ: { value: 0 },
  };
  const analyser = {
    ...node(),
    fftSize: 512,
    getFloatTimeDomainData: (samples: Float32Array) => samples.fill(0.1),
  };
  const context = {
    currentTime: 1,
    destination: node(),
    createMediaStreamSource: () => source,
    createGain: () => gain,
    createMediaStreamDestination: () => destination,
    createPanner: () => panner,
    createAnalyser: () => analyser,
    close: vi.fn().mockResolvedValue(undefined),
  };
  vi.stubGlobal('AudioContext', function () {
    return context;
  });
  return { raw, outgoing, stream, context, source, gain, destination, panner };
}
describe('voice audio and privacy', () => {
  it('gates only the outgoing stream, never plays the local microphone, and cleans up', () => {
    const fixture = audioFixture();
    const pipeline = createAudioPipeline(fixture.stream, {
      mode: 'ptt',
      talking: false,
      muted: false,
      detectedSpeech: false,
    });
    expect(fixture.outgoing.enabled).toBe(false);
    expect(fixture.raw.enabled).toBe(true);
    expect(fixture.gain.connect).toHaveBeenCalledWith(fixture.destination);
    expect(fixture.gain.connect).not.toHaveBeenCalledWith(fixture.context.destination);
    pipeline.update({ talking: true });
    expect(fixture.outgoing.enabled).toBe(true);
    pipeline.update({ muted: true });
    expect(fixture.outgoing.enabled).toBe(false);
    pipeline.update({ muted: false, mode: 'vad', detectedSpeech: true });
    expect(fixture.outgoing.enabled).toBe(true);
    pipeline.update({ detectedSpeech: false });
    expect(fixture.outgoing.enabled).toBe(false);
    pipeline.dispose();
    expect(fixture.raw.stop).toHaveBeenCalledOnce();
    expect(fixture.outgoing.stop).toHaveBeenCalledOnce();
  });
  it('uses HRTF seats, local mute/volume and analyser rings without signaling audio samples', () => {
    vi.useFakeTimers();
    const fixture = audioFixture();
    const onSpeaking = vi.fn();
    const audio = connectRemoteStream(
      fixture.context as unknown as AudioContext,
      fixture.stream,
      { id: 'peer', position: 'left', volume: 0.4, muted: false },
      onSpeaking,
    );
    expect(fixture.panner.panningModel).toBe('HRTF');
    expect(fixture.panner.positionX.value).toBe(-0.85);
    vi.advanceTimersByTime(80);
    expect(onSpeaking).toHaveBeenLastCalledWith(true);
    audio.update({ id: 'peer', position: 'right', volume: 0.4, muted: true });
    expect(fixture.panner.positionX.value).toBe(0.85);
    expect(fixture.gain.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 1);
    vi.advanceTimersByTime(80);
    expect(onSpeaking).toHaveBeenLastCalledWith(false);
    audio.dispose();
    expect(fixture.source.disconnect).toHaveBeenCalledOnce();
  });
  it('maps voice around the local seat and clamps playback', () => {
    const positions = relativePositions(
      [
        { id: 'a', seat: 0 },
        { id: 'b', seat: 1 },
        { id: 'c', seat: 2 },
        { id: 'd', seat: 3 },
      ],
      'c',
    );
    expect(positions.get('c')).toBe('bottom');
    expect(listenerPoint(positions.get('d')!).x).toBe(-0.85);
    expect(playbackGain(4, false)).toBe(1);
    expect(playbackGain(-1, false)).toBe(0);
    expect(playbackGain(1, true)).toBe(0);
    expect(shouldTransmit({ mode: 'off', muted: false, talking: true, detectedSpeech: true })).toBe(
      false,
    );
    expect(
      voiceSupport({
        isSecureContext: false,
        hasGetUserMedia: true,
        hasAudioContext: true,
        hasPeerConnection: true,
      }).reason,
    ).toBe('insecure-context');
    expect(classifyMediaError(new DOMException('Denied', 'NotAllowedError'))).toBe(
      'permission-denied',
    );
  });
  it('rejects malformed signaling and elects exactly one offerer', () => {
    expect(parseSignal(null)).toBeNull();
    expect(parseSignal({ from: 1, sdp: {} })).toBeNull();
    expect(parseSignal({ from: 'peer', sdp: { type: 'offer' } })).toBeNull();
    expect(shouldOffer('a', 'b')).toBe(true);
    expect(shouldOffer('b', 'a')).toBe(false);
  });
  it('RNNoise worklet outputs processed frames with correct scaling and disposes native memory', () => {
    const heap = new Float32Array(500);
    const module = {
      HEAPF32: heap,
      _malloc: () => 0,
      _rnnoise_create: () => 1,
      _rnnoise_destroy: vi.fn(),
      _free: vi.fn(),
      _rnnoise_process_frame: vi.fn(() => {
        for (let i = 0; i < 480; i++) heap[i] = heap[i]! * 0.5;
      }),
    };
    let Processor:
      | (new () => {
          process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
          port: { onmessage: (event: { data: string }) => void };
        })
      | undefined;
    const source = readFileSync('src/voice/rnnoise-worklet.js', 'utf8').replace(
      /^import .*;$/m,
      '',
    );
    runInNewContext(source, {
      createRNNWasmModuleSync: () => module,
      AudioWorkletProcessor: class {
        port = { onmessage: () => {}, postMessage: () => {} };
      },
      registerProcessor: (_name: string, ctor: typeof Processor) => {
        Processor = ctor;
      },
    });
    const worklet = new Processor!();
    const input = new Float32Array(128).fill(0.25);
    const output = new Float32Array(128);
    const heard: number[] = [];
    for (let i = 0; i < 16; i++) {
      worklet.process([[input]], [[output]]);
      heard.push(...output);
    }
    expect(module._rnnoise_process_frame).toHaveBeenCalled();
    expect(heard.slice(0, 480).every((sample) => sample === 0)).toBe(true);
    expect(heard.slice(480).every((sample) => sample === 0.125)).toBe(true);
    worklet.port.onmessage({ data: 'dispose' });
    worklet.port.onmessage({ data: 'dispose' });
    expect(module._free).toHaveBeenCalledOnce();
    expect(module._rnnoise_destroy).toHaveBeenCalledOnce();
    expect(worklet.process([[input]], [[output]])).toBe(false);
  });
});
