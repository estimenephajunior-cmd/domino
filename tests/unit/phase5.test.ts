/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameRuntime } from '../../server/gameRuntime.js';
import { PhaseFiveSession } from '../../server/phaseFive.js';
import { createTableState, passMove, playTileMove } from '../../shared/moves.js';
import { timeoutMove } from '../../shared/speed.js';
import { DEFAULT_MUTATORS } from '../../shared/mutators.js';
import type { DominosState } from '../../shared/dominosGame.js';
import type { MutatorConfig } from '../../shared/phaseFive.js';
import type { Tile } from '../../shared/types.js';

const tile = (low: number, high: number): Tile => ({ id: `${low}-${high}`, low, high });
const people = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id }));
const sessions: PhaseFiveSession[] = [];
function fixture(config: MutatorConfig, count = 2) {
  const runtime = new GameRuntime({
    players: people.slice(0, count),
    variant: 'block',
    seed: 'mutators',
    handSize: 6,
    mutators: config,
  });
  const base = runtime.snapshot();
  const state: DominosState = {
    ...base.G,
    phase: 'awaiting-play',
    currentPlayer: 'a',
    chain: {
      tiles: [{ ...tile(4, 6), left: 4, right: 6 }],
      leftEnd: 4,
      rightEnd: 6,
      spinner: null,
    },
    players: base.G.players.map((player, index) => ({
      ...player,
      score: 0,
      hand:
        index === 0
          ? [tile(4, 4), tile(1, 4), tile(0, 0)]
          : [tile(0, index + 1), tile(2, index + 1)],
    })),
    boneyard: [tile(1, 6), tile(3, 6), tile(5, 6)],
    lastMove: null,
  };
  runtime.restore({ ...base, G: state, ctx: { ...base.ctx, currentPlayer: 'a', playOrderPos: 0 } });
  const changed = vi.fn();
  const feature = new PhaseFiveSession(runtime, changed);
  sessions.push(feature);
  return { runtime, feature, changed };
}
function play(runtime: GameRuntime, feature: PhaseFiveSession, tileId = '4-4') {
  const checkpoint = feature.checkpoint();
  expect(runtime.move('a', 'playTile', [tileId, 'left'])).toBe(true);
  feature.committed('playTile', checkpoint);
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => {
  sessions.splice(0).forEach((session) => session.dispose());
  vi.useRealTimers();
});

const combinations = Array.from({ length: 8 }, (_, mask): MutatorConfig => ({
  speed: Boolean(mask & 1),
  wildDouble: Boolean(mask & 2),
  hotPotato: Boolean(mask & 4),
}));
describe('all eight mutator combinations', () => {
  it.each(combinations)(
    'restores every private/public field and the correct clock for %j',
    (config) => {
      const { runtime, feature } = fixture(config);
      vi.advanceTimersByTime(1500);
      const before = runtime.game;
      play(runtime, feature);
      expect(runtime.game.currentPlayer).toBe(config.wildDouble ? 'a' : 'b');
      expect(feature.request('a')).toBeNull();
      const id = feature.view().undo.vote!.id;
      vi.advanceTimersByTime(3000);
      expect(runtime.game.turn).toBe(before.turn + 1);
      expect(feature.view().turnDeadline).toBeNull();
      expect(feature.cast('b', id, true)).toBeNull();
      expect(runtime.game).toEqual(before);
      expect(feature.view().undo.result).toBe('approved');
      expect(feature.view().turnDeadline).toBe(config.speed ? Date.now() + 8500 : null);
      expect(feature.request('a')).toContain('latest placement');
    },
  );
});

describe('undo voting and bounded snapshot cache', () => {
  it('requires a strict majority and rejects outsiders, duplicate votes and stale IDs', () => {
    const { runtime, feature } = fixture(DEFAULT_MUTATORS, 4);
    play(runtime, feature);
    expect(feature.request('b')).not.toBeNull();
    expect(feature.request('a')).toBeNull();
    const vote = feature.view().undo.vote!;
    expect(feature.cast('outsider', vote.id, true)).not.toBeNull();
    expect(feature.cast('b', 'stale', true)).not.toBeNull();
    expect(feature.cast('a', vote.id, true)).toContain('already voted');
    expect(feature.cast('b', vote.id, true)).toBeNull();
    expect(feature.voting).toBe(true); // 2/4 is not a majority
    expect(feature.cast('c', vote.id, false)).toBeNull();
    expect(feature.cast('d', vote.id, true)).toBeNull();
    expect(feature.view().undo.result).toBe('approved');
    expect(feature.cast('b', vote.id, true)).not.toBeNull();
  });
  it('removes an All Fives scoring award on undo while keeping reducer versions monotonic', () => {
    const { runtime, feature } = fixture({ speed: true, wildDouble: true, hotPotato: true });
    const snapshot = runtime.snapshot();
    runtime.restore({
      ...snapshot,
      G: {
        ...snapshot.G,
        variant: 'all-fives',
        chain: {
          tiles: [{ ...tile(2, 4), left: 2, right: 4 }],
          leftEnd: 2,
          rightEnd: 4,
          spinner: null,
        },
        players: snapshot.G.players.map((player) => ({ ...player, score: 7 })),
      },
    });
    const checkpoint = feature.checkpoint();
    expect(runtime.move('a', 'playTile', ['4-4', 'right'])).toBe(true);
    feature.committed('playTile', checkpoint);
    expect(runtime.game.players[0]!.score).toBe(17);
    const playedVersion = runtime.snapshot()._stateID;
    feature.request('a');
    feature.cast('b', feature.view().undo.vote!.id, true);
    expect(runtime.game.players.map((player) => player.score)).toEqual([7, 7]);
    expect(runtime.game.chain.spinner).toBeNull();
    expect(runtime.snapshot()._stateID).toBeGreaterThan(playedVersion);
  });
  it('expires the five-second request window exactly at its deadline', () => {
    const { runtime, feature } = fixture(DEFAULT_MUTATORS);
    play(runtime, feature);
    vi.advanceTimersByTime(5000);
    expect(feature.request('a')).not.toBeNull();
    expect(feature.view().undo.availableFor).toBeNull();
  });
  it('expires a vote after ten seconds and resumes the paused remaining time', () => {
    const { runtime, feature } = fixture({ ...DEFAULT_MUTATORS, speed: true });
    play(runtime, feature);
    vi.advanceTimersByTime(1000);
    feature.request('a');
    const afterPlay = runtime.game;
    vi.advanceTimersByTime(9999);
    expect(feature.voting).toBe(true);
    vi.advanceTimersByTime(1);
    expect(feature.view().undo.result).toBe('expired');
    expect(runtime.game).toEqual(afterPlay);
    expect(feature.view().turnDeadline).toBe(Date.now() + 9000);
  });
  it('rejects early when a majority is impossible and never resets the clock to a full turn', () => {
    const { runtime, feature } = fixture({ ...DEFAULT_MUTATORS, speed: true });
    play(runtime, feature);
    vi.advanceTimersByTime(2000);
    feature.request('a');
    feature.cast('b', feature.view().undo.vote!.id, false);
    expect(feature.view().undo.result).toBe('rejected');
    expect(feature.view().turnDeadline).toBe(Date.now() + 8000);
  });
  it('invalidates the cached placement when another move occurs', () => {
    const { runtime, feature } = fixture({ ...DEFAULT_MUTATORS, wildDouble: true });
    play(runtime, feature);
    const checkpoint = feature.checkpoint();
    expect(runtime.move('a', 'playTile', ['1-4', 'left'])).toBe(true);
    feature.committed('playTile', checkpoint);
    feature.request('a');
    feature.cast('b', feature.view().undo.vote!.id, true);
    expect(runtime.game.chain.tiles).toHaveLength(2); // first double remains
    expect(feature.view().undo.availableFor).toBeNull();
  });
  it('does not cache a winning placement after shuffle secrets can be revealed', () => {
    const { runtime, feature } = fixture(DEFAULT_MUTATORS);
    const state = runtime.snapshot();
    runtime.restore({
      ...state,
      G: {
        ...state.G,
        players: state.G.players.map((player) =>
          player.id === 'a' ? { ...player, hand: [tile(4, 4)] } : player,
        ),
      },
    });
    play(runtime, feature);
    expect(runtime.game.phase).toBe('hand-complete');
    expect(feature.request('a')).not.toBeNull();
  });
});

describe('Speed, Wild Double and Hot Potato interactions', () => {
  it('skips a playable timed-out turn and resets the clock even after a Wild Double', () => {
    const { runtime, feature } = fixture({ speed: true, wildDouble: true, hotPotato: true });
    play(runtime, feature);
    expect(runtime.game.currentPlayer).toBe('a');
    const held = runtime.game.players[0]!.hand.length;
    vi.advanceTimersByTime(10000);
    expect(runtime.game.currentPlayer).toBe('b');
    expect(runtime.game.players[0]!.hand).toHaveLength(held + 1);
    expect(feature.view().timeoutSequence).toBe(1);
    expect(runtime.game.phase).toBe('awaiting-play');
    expect(feature.view().turnDeadline).toBe(Date.now() + 10000);
  });
  it('does not grant an extra turn for a non-double', () => {
    const { runtime, feature } = fixture({ ...DEFAULT_MUTATORS, wildDouble: true });
    play(runtime, feature, '1-4');
    expect(runtime.game.currentPlayer).toBe('b');
  });
  it('does not extend the Speed deadline on draws', () => {
    const { runtime, feature } = fixture({ ...DEFAULT_MUTATORS, speed: true });
    const snapshot = runtime.snapshot();
    runtime.restore({
      ...snapshot,
      G: {
        ...snapshot.G,
        variant: 'draw',
        players: snapshot.G.players.map((player) => ({ ...player, hand: [tile(0, 0)] })),
      },
    });
    vi.advanceTimersByTime(4000);
    const checkpoint = feature.checkpoint();
    expect(runtime.move('a', 'drawTile')).toBe(true);
    feature.committed('drawTile', checkpoint);
    expect(feature.view().turnDeadline).toBe(1_010_000);
    vi.advanceTimersByTime(6000);
    expect(runtime.game.currentPlayer).toBe('b');
  });
  it('selects a reproducible penalty from stock without duplicating tiles or changing earlier states', () => {
    const state = createTableState(people.slice(0, 2), 'block', 'penalty', 6, {
      ...DEFAULT_MUTATORS,
      hotPotato: true,
    });
    const blocked = {
      ...state,
      currentPlayer: 'a',
      chain: {
        tiles: [{ ...tile(6, 6), left: 6, right: 6 }],
        leftEnd: 6,
        rightEnd: 6,
        spinner: null,
      },
      players: state.players.map((player) => ({ ...player, hand: [tile(0, 0)] })),
      boneyard: [tile(1, 2), tile(3, 4), tile(4, 5)],
    };
    const copy = structuredClone(blocked);
    const first = passMove(blocked, 'a');
    const second = passMove(blocked, 'a');
    expect(first).toEqual(second);
    expect(blocked).toEqual(copy);
    expect(first.ok && first.state.players[0]!.hand).toHaveLength(2);
    expect(first.ok && first.state.boneyard).toHaveLength(2);
    expect(first.ok && first.state.passStreak).toBe(0);
  });
  it('keeps penalties optional when stock is empty and resolves truly blocked Speed tables', () => {
    let state = createTableState(people.slice(0, 2), 'block', 'empty', 6, {
      speed: true,
      hotPotato: true,
      wildDouble: true,
    });
    state = {
      ...state,
      phase: 'awaiting-play',
      currentPlayer: 'a',
      chain: { tiles: [], leftEnd: 6, rightEnd: 6, spinner: null },
      boneyard: [],
      players: state.players.map((player) => ({
        ...player,
        hand: [tile(0, player.id === 'a' ? 1 : 2)],
      })),
    };
    const first = timeoutMove(state, 'a');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = timeoutMove({ ...first.state, currentPlayer: 'b' }, 'b');
    expect(second.ok && second.state.phase).toBe('hand-complete');
  });
  it('keeps normal move and pass validation intact under mutators', () => {
    const { runtime } = fixture({ speed: true, wildDouble: true, hotPotato: true });
    expect(passMove(runtime.game, 'a').ok).toBe(false);
    expect(playTileMove(runtime.game, 'b', '4-4', 'left').ok).toBe(false);
    expect(timeoutMove({ ...runtime.game, mutators: DEFAULT_MUTATORS }, 'a').ok).toBe(false);
  });
  it('honors a deadline even when the timer callback has not run yet', () => {
    const { runtime, feature } = fixture({ ...DEFAULT_MUTATORS, speed: true });
    vi.setSystemTime(1_010_001);
    feature.synchronize();
    expect(runtime.game.currentPlayer).toBe('b');
    expect(feature.view().timeoutSequence).toBe(1);
  });
  it('carries all three mutators into a new hand with a fresh full Speed clock', () => {
    const config = { speed: true, wildDouble: true, hotPotato: true };
    const { runtime, feature } = fixture(config);
    const snapshot = runtime.snapshot();
    runtime.restore({ ...snapshot, G: { ...snapshot.G, phase: 'hand-complete', winner: 'a' } });
    const checkpoint = feature.checkpoint();
    expect(runtime.move('b', 'nextHand', ['new-private-seed'])).toBe(true);
    feature.committed('nextHand', checkpoint);
    expect(runtime.game.mutators).toEqual(config);
    expect(runtime.game.handNumber).toBe(2);
    expect(runtime.game.phase).toBe('mixing');
    expect(feature.view().turnDeadline).toBeNull();
    expect(feature.view().undo.availableFor).toBeNull();
  });
  it('cancels all clocks and cached snapshots when a table is disposed', () => {
    const { runtime, feature, changed } = fixture({ ...DEFAULT_MUTATORS, speed: true });
    play(runtime, feature);
    feature.request('a');
    const state = runtime.game;
    feature.dispose();
    changed.mockClear();
    vi.advanceTimersByTime(60000);
    expect(runtime.game).toEqual(state);
    expect(changed).not.toHaveBeenCalled();
    expect(feature.view().undo.availableFor).toBeNull();
  });
});
