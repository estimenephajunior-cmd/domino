/**
 * @vitest-environment node
 *
 * Socket-level integration tests: real clients drive the real server stack
 * (Express + Socket.IO + authoritative engine) on an ephemeral port.
 * Hand privacy, turn advancement, and multi-hand flow are asserted end to end.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { legalMoves } from '../../shared/engine.js';
import type { PlayerView } from '../../shared/types.js';
import { createServerInstance } from '../../server/index.js';
import { createMemoryStore } from '../../server/rooms.js';

/**
 * Phase 2 acceptance: two real clients drive a full hand through the
 * authoritative server — lobby → ready → moves → completion — while private
 * hands are verified to never leak across the wire.
 */

interface JoinedPayload {
  meta: { code: string };
  playerId: string;
  sessionToken: string;
}

interface GameStatePayload {
  playerId: string;
  view: PlayerView;
}

function once<T>(socket: ClientSocket, event: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for "${event}"`));
    }, timeoutMs);
    const handler = (payload: T): void => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, handler);
  });
}

function nextState(socket: ClientSocket): Promise<GameStatePayload> {
  return once<GameStatePayload>(socket, 'game:state');
}

describe('authoritative multiplayer (socket integration)', () => {
  let url = '';
  let close: () => Promise<void> = async () => {};

  beforeAll(async () => {
    const { httpServer } = createServerInstance(createMemoryStore(), { mixDurationMs: 0 });
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    const address = httpServer.address() as AddressInfo;
    url = `http://127.0.0.1:${address.port}`;
    close = async () => {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    };
  });

  afterAll(async () => {
    await close();
  });

  it('hosts a full two-player hand with private racks', async () => {
    const a = clientIo(url, { transports: ['websocket'] });
    const b = clientIo(url, { transports: ['websocket'] });
    try {
      await Promise.all([once(a, 'connect'), once(b, 'connect')]);

      // A creates the room and joins automatically.
      a.emit('room:create', { variant: 'block', name: 'Ana' });
      const joinedA = await once<JoinedPayload>(a, 'room:joined');
      expect(joinedA.sessionToken.length).toBeGreaterThan(0);
      const code = joinedA.meta.code;

      b.emit('room:join', { code, name: 'Bob' });
      const joinedB = await once<JoinedPayload>(b, 'room:joined');
      expect(joinedB.playerId).not.toBe(joinedA.playerId);

      // Both ready up → server deals the opening hand.
      const stateAPromise = nextState(a);
      const stateBPromise = nextState(b);
      a.emit('room:ready', { ready: true });
      b.emit('room:ready', { ready: true });
      let [firstA, firstB] = await Promise.all([stateAPromise, stateBPromise]);
      const dealer = firstA.view.dealerId === joinedA.playerId ? a : b;
      const mixedA = nextState(a);
      const mixedB = nextState(b);
      dealer.emit('game:mix');
      [firstA, firstB] = await Promise.all([mixedA, mixedB]);
      const clock = vi.spyOn(Date, 'now').mockReturnValue(firstA.view.mixingEndsAt!);
      try {
        while (firstA.view.phase !== 'awaiting-play') {
          const picker = firstA.view.players.find((player) => player.handCount < 7)!.id;
          const socket = picker === joinedA.playerId ? a : b;
          const slotId = firstA.view.dealSlots.find((slot) => !slot.claimed)!.id;
          const pickedA = nextState(a);
          const pickedB = nextState(b);
          socket.emit('game:pick', { slotId });
          [firstA, firstB] = await Promise.all([pickedA, pickedB]);
        }
      } finally {
        clock.mockRestore();
      }

      // --- privacy: racks never leak ---
      const handA = firstA.view.yourHand;
      const handB = firstB.view.yourHand;
      expect(handA).toHaveLength(7);
      expect(handB).toHaveLength(7);
      expect(firstA.view.players).toHaveLength(2);
      const opponentOfA = firstA.view.players.find((p) => p.id !== joinedA.playerId);
      expect(opponentOfA?.handCount).toBe(7);
      const total =
        handA.length +
        (opponentOfA?.handCount ?? 0) +
        firstA.view.boneyardCount +
        firstA.view.chain.tiles.length;
      expect(total).toBe(28);
      // The opponent's private tiles must not appear anywhere in A's payload.
      const serialized = JSON.stringify(firstA);
      for (const tile of firstB.view.yourHand) {
        const peerHand = firstA.view.yourHand.map((t) => t.id);
        if (!peerHand.includes(tile.id)) {
          expect(serialized).not.toContain(`"low":${tile.low},"high":${tile.high}`);
        }
      }

      // --- illegal move rejected, game unaffected ---
      // The opener often cannot match their own opening tile; either mover
      // direction is fine, so pick whichever seat has the earlier claim.
      const isACurrent = firstA.view.currentPlayer === joinedA.playerId;
      const mover = isACurrent ? a : b;
      mover.emit('game:play', { tileId: 'not-a-tile', end: 'left' });
      const err = await once<{ reason: string }>(mover, 'game:error');
      expect(err.reason).toMatch(/not in your hand/i);

      // --- auto-play the whole hand to completion ---
      // Each socket tracks its own latest view (own hand included); the loop
      // always reads `currentPlayer` from the freshest table state. Block
      // variant: play when possible, otherwise pass (no draws allowed).
      const latest = new Map<string, PlayerView>([
        [joinedA.playerId, firstA.view],
        [joinedB.playerId, firstB.view],
      ]);
      const sockets = new Map([
        [joinedA.playerId, a],
        [joinedB.playerId, b],
      ]);
      let currentPlayerId = firstA.view.currentPlayer;
      for (let guard = 0; guard < 60; guard++) {
        const table = [...latest.values()].find((v) => v.currentPlayer === currentPlayerId);
        if (!table || table.phase === 'hand-complete') break;
        const sock = sockets.get(table.currentPlayer);
        const mine = latest.get(table.currentPlayer);
        if (!sock || !mine) throw new Error('no socket/view for current player');
        const options = legalMoves([...mine.yourHand], table.chain, 'block');
        const pA = nextState(a);
        const pB = nextState(b);
        if (options.length > 0) {
          const pick = options[0]!;
          sock.emit('game:play', { tileId: pick.tile.id, end: pick.end });
        } else {
          sock.emit('game:pass');
        }
        const [rA, rB] = await Promise.all([pA, pB]);
        latest.set(joinedA.playerId, rA.view);
        latest.set(joinedB.playerId, rB.view);
        // Every committed move/pass advances the turn (block, ≥1 tile held).
        expect(rA.view.turn).toBeGreaterThan(0);
        currentPlayerId = rA.view.currentPlayer;
      }

      // Re-read the freshest known view across both seats.
      const endViews = [...latest.values()];
      const completed = endViews.find((v) => v.phase === 'hand-complete');
      expect(completed).toBeDefined();
      expect(completed?.chain.tiles.length).toBeGreaterThanOrEqual(1);
      expect(completed?.winner).not.toBeNull();
      // Scores settled on both clients' final views.
      for (const v of endViews) {
        const winnerScore = v.players.find((p) => p.id === v.winner)?.score;
        expect(winnerScore).toBeGreaterThan(0);
      }

      // --- next hand redeals for both clients ---
      const nextAP = nextState(a);
      const nextBP = nextState(b);
      a.emit('game:next-hand');
      const [nextA, nextB] = await Promise.all([nextAP, nextBP]);
      expect(nextA.view.handNumber).toBe(2);
      expect(nextB.view.handNumber).toBe(2);
      expect(nextA.view.phase).toBe('mixing');
      expect(nextB.view.phase).toBe('mixing');
      expect(nextA.view.yourHand).toHaveLength(0);
      expect(nextA.view.dealerId).not.toBe(firstA.view.dealerId);
    } finally {
      a.disconnect();
      b.disconnect();
    }
  }, 30000);
});
