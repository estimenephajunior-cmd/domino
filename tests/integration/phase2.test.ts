/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { createServerInstance } from '../../server/index.js';
import { createMemoryStore } from '../../server/rooms.js';
import { getGameState } from '../../server/game.js';
import { legalMoves } from '../../shared/engine.js';
import { verifyShuffleProof } from '../../shared/fairness.js';
import {
  VARIANT_RULES,
  type PlayerView,
  type RoomMeta,
  type RuleVariant,
} from '../../shared/types.js';

interface Joined {
  meta: RoomMeta;
  playerId: string;
  sessionToken: string;
}
interface StateMessage {
  playerId: string;
  view: PlayerView;
}
function once<T>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Waiting for ${event}`));
    }, timeoutMs);
    const listener = (value: T) => {
      clearTimeout(timer);
      resolve(value);
    };
    socket.once(event, listener);
  });
}

describe('phase 2 multiplayer acceptance', () => {
  let server: ReturnType<typeof createServerInstance>;
  let url: string;
  let sockets: Socket[];
  beforeEach(async () => {
    server = createServerInstance(createMemoryStore(), { mixDurationMs: 0 });
    sockets = [];
    await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    vi.useRealTimers();
    for (const socket of sockets) socket.disconnect();
    await new Promise<void>((resolve) => server.io.close(() => resolve()));
    server.store.db.close();
  });
  async function client() {
    const socket = connect(url, { transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    await once(socket, 'connect');
    return socket;
  }
  async function table(variant: RuleVariant, count = 2) {
    const host = await client();
    const joinedPromise = once<Joined>(host, 'room:joined');
    host.emit('room:create', { variant, name: 'Host' });
    const joined = [await joinedPromise];
    const clients = [host];
    for (let i = 1; i < count; i++) {
      const socket = await client();
      const pending = once<Joined>(socket, 'room:joined');
      socket.emit('room:join', { code: joined[0]!.meta.code, name: `Guest ${i}` });
      joined.push(await pending);
      clients.push(socket);
    }
    return { clients, joined, code: joined[0]!.meta.code };
  }
  async function ready(clients: Socket[]) {
    const pending = clients.map((socket) => once<StateMessage>(socket, 'game:state'));
    clients.forEach((socket) => socket.emit('room:ready', { ready: true }));
    let views = (await Promise.all(pending)).map((message) => message.view);
    const dealer = views[0]!.players.findIndex((player) => player.id === views[0]!.dealerId);
    const mixed = clients.map((socket) => once<StateMessage>(socket, 'game:state'));
    clients[dealer]!.emit('game:mix');
    views = (await Promise.all(mixed)).map((message) => message.view);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(views[0]!.mixingEndsAt!);
    try {
      while (views[0]!.phase !== 'awaiting-play') {
        const pickerId = views[0]!.players.find((player) => player.handCount < 7)!.id;
        const picker = views[0]!.players.findIndex((player) => player.id === pickerId);
        const slotId = views[0]!.dealSlots.find((slot) => !slot.claimed)!.id;
        const updates = clients.map((socket) => once<StateMessage>(socket, 'game:state'));
        clients[picker]!.emit('game:pick', { slotId });
        views = (await Promise.all(updates)).map((message) => message.view);
      }
    } finally {
      clock.mockRestore();
    }
    return views;
  }

  it.each(['block', 'draw', 'latin'] as const)(
    'plays a complete %s hand, verifies fairness, then redeals with a new secret',
    async (variant) => {
      const { clients, joined, code } = await table(
        variant,
        VARIANT_RULES[variant].partnership ? 4 : 2,
      );
      const commits: string[] = [];
      clients[0]!.on('game:commitment', ({ commitment }: { commitment: string }) =>
        commits.push(commitment),
      );
      let views = await ready(clients);
      const initialCommitment = views[0]!.fairness!.commitment;
      expect(commits).toEqual([initialCommitment]);
      expect(views.every((view) => view.seed === '' && view.fairness?.reveal === null)).toBe(true);
      const secret = getGameState(server.store, code)!.seed;
      expect(JSON.stringify(views)).not.toContain(secret);
      const deckSize = 28;
      expect(
        views.reduce((sum, view) => sum + view.yourHand.length, 0) +
          views[0]!.boneyardCount +
          views[0]!.chain.tiles.length,
      ).toBe(deckSize);
      for (let turn = 0; turn < 200 && views[0]!.phase !== 'hand-complete'; turn++) {
        const mover = joined.findIndex((entry) => entry.playerId === views[0]!.currentPlayer);
        const view = views[mover]!;
        const choices = legalMoves(view.yourHand, view.chain, variant);
        const pending = clients.map((socket) => once<StateMessage>(socket, 'game:state'));
        if (choices[0])
          clients[mover]!.emit('game:play', { tileId: choices[0].tile.id, end: choices[0].end });
        else
          clients[mover]!.emit(
            VARIANT_RULES[variant].allowDraw && view.boneyardCount > 0 ? 'game:draw' : 'game:pass',
          );
        views = (await Promise.all(pending)).map((message) => message.view);
        expect(views.every((v) => v.turn === views[0]!.turn)).toBe(true);
      }
      const final = views[0]!;
      expect(final.phase).toBe('hand-complete');
      expect(final.fairness!.commitment).toBe(initialCommitment);
      const proof = final.fairness!.reveal!;
      expect(proof.seed).toBe(secret);
      await expect(
        verifyShuffleProof(proof, VARIANT_RULES[variant].setSize, initialCommitment),
      ).resolves.toBe(true);
      const pending = clients.map((socket) => once<StateMessage>(socket, 'game:state'));
      clients[clients.length - 1]!.emit('game:next-hand');
      const next = await Promise.all(pending);
      expect(
        next.every(
          ({ view }) => view.handNumber === 2 && view.seed === '' && view.fairness?.reveal === null,
        ),
      ).toBe(true);
      expect(getGameState(server.store, code)!.seed).not.toBe(secret);
      expect(commits).toHaveLength(2);
    },
  );

  it('rejects disabled Caribbean room creation', async () => {
    const socket = await client();
    const error = once<{ reason: string }>(socket, 'room:error');
    socket.emit('room:create', { variant: 'caribbean', name: 'Host' });
    expect((await error).reason).toBeTruthy();
  });

  it('broadcasts bounded placement effects only after an accepted authoritative move', async () => {
    const { clients, joined } = await table('draw', 2);
    let views = await ready(clients);
    let actor = 0;
    let move = legalMoves(views[0]!.yourHand, views[0]!.chain, 'draw')[0];
    for (let guard = 0; guard < 40; guard++) {
      actor = joined.findIndex((entry) => entry.playerId === views[0]!.currentPlayer);
      move = legalMoves(views[actor]!.yourHand, views[actor]!.chain, 'draw')[0];
      if (move) break;
      const updates = clients.map((socket) => once<StateMessage>(socket, 'game:state'));
      clients[actor]!.emit(views[actor]!.boneyardCount ? 'game:draw' : 'game:pass');
      views = (await Promise.all(updates)).map((message) => message.view);
    }
    expect(move).toBeDefined();
    const rejected = once<{ reason: string }>(clients[actor]!, 'game:error');
    clients[actor]!.emit('game:play', { tileId: move!.tile.id, end: move!.end, velocity: 100 });
    expect((await rejected).reason).toBe('Invalid play payload.');
    const impact = once<Record<string, unknown>>(clients[1 - actor]!, 'game:placement');
    const updated = once<StateMessage>(clients[actor]!, 'game:state');
    clients[actor]!.emit('game:play', { tileId: move!.tile.id, end: move!.end, velocity: 3.5 });
    expect(await impact).toEqual({
      tileId: move!.tile.id,
      playerId: joined[actor]!.playerId,
      velocity: 3.5,
    });
    expect((await updated).view.yourHand.some((tile) => tile.id === move!.tile.id)).toBe(false);
  });

  it('voice presence is authenticated, room scoped, reset on disconnect and accepts no extra fields', async () => {
    const room = await table('block', 2);
    const host = room.clients[0]!;
    const guest = room.clients[1]!;
    const joined = room.joined[0]!;
    const ready = new Promise<RoomMeta>((resolve) => {
      const listener = (meta: RoomMeta) => {
        if (meta.seats.some((seat) => seat.id === joined.playerId && seat.voiceEnabled)) {
          guest.off('room:state', listener);
          resolve(meta);
        }
      };
      guest.on('room:state', listener);
    });
    host.emit('voice:state', { enabled: true });
    expect((await ready).seats.find((seat) => seat.id === joined.playerId)?.voiceEnabled).toBe(
      true,
    );
    const stored = server.store.get(joined.meta.code)!;
    host.emit('voice:state', { enabled: false, playerId: room.joined[1]!.playerId });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stored.players.get(joined.playerId)?.voiceEnabled).toBe(true);
    const outsider = await client();
    outsider.emit('voice:state', { enabled: false });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stored.players.get(joined.playerId)?.voiceEnabled).toBe(true);
    const departed = once<RoomMeta>(guest, 'room:state');
    host.disconnect();
    const seat = (await departed).seats.find((entry) => entry.id === joined.playerId);
    expect(seat?.connected).toBe(false);
    expect(seat?.voiceEnabled).toBe(false);
  });

  it('caps rooms at four seats without rejecting an existing member joining again', async () => {
    const { clients, joined, code } = await table('latin', 4);
    const duplicate = once<Joined>(clients[0]!, 'room:joined');
    clients[0]!.emit('room:join', { code, name: 'Host' });
    expect((await duplicate).playerId).toBe(joined[0]!.playerId);
    expect(server.store.get(code)!.players.size).toBe(4);
    const fifth = await client();
    const full = once(fifth, 'room:full');
    fifth.emit('room:join', { code, name: 'Fifth' });
    await full;
    expect(server.store.get(code)!.players.size).toBe(4);
  });

  it('acknowledges leaving, releases a live match, and allows the remaining players to restart', async () => {
    const { clients, joined, code } = await table('block', 3);
    await ready(clients);
    const left = once(clients[2]!, 'room:left');
    const ended = once(clients[0]!, 'game:ended');
    clients[2]!.emit('room:leave');
    await Promise.all([left, ended]);
    expect(getGameState(server.store, code)).toBeUndefined();
    expect(server.store.get(code)!.players.has(joined[2]!.playerId)).toBe(false);
    expect([...server.store.get(code)!.players.values()].every((p) => !p.ready)).toBe(true);
    await ready(clients.slice(0, 2));
    expect(getGameState(server.store, code)).toBeDefined();
  });

  it('locks live settings and prevents late joins, while rejecting malformed and out-of-turn actions', async () => {
    const { clients, code } = await table('draw');
    const denied = once<{ reason: string }>(clients[1]!, 'room:error');
    clients[1]!.emit('room:variant', { variant: 'block' });
    expect((await denied).reason).toContain('host');
    const views = await ready(clients);
    const locked = once<{ reason: string }>(clients[0]!, 'room:error');
    clients[0]!.emit('room:variant', { variant: 'block' });
    expect((await locked).reason).toContain('locked');
    const guest = await client();
    const late = once<{ reason: string }>(guest, 'room:error');
    guest.emit('room:join', { code, name: 'Late' });
    expect((await late).reason).toContain('started');
    const malformed = once<{ reason: string }>(clients[0]!, 'game:error');
    clients[0]!.emit('game:play', { tileId: '0-0', end: 'invalid' });
    expect((await malformed).reason).toContain('Invalid');
    const idle = views.findIndex(
      (view, i) => view.currentPlayer !== [...server.store.get(code)!.players.values()][i]!.id,
    );
    const before = getGameState(server.store, code);
    const illegal = once<{ reason: string }>(clients[idle]!, 'game:error');
    clients[idle]!.emit('game:pass');
    expect((await illegal).reason).toContain('not your turn');
    expect(getGameState(server.store, code)).toBe(before);
  });

  it('restores a reserved seat only with its secret token and revokes the old socket on takeover', async () => {
    const { clients, joined, code } = await table('block');
    const views = await ready(clients);
    const stranger = await client();
    const denied = once<{ reason: string }>(stranger, 'room:error');
    stranger.emit('room:rejoin', { code, token: 'wrong-token' });
    expect((await denied).reason).toContain('invalid');
    const replacement = await client();
    const rebound = once<Joined>(replacement, 'room:rejoined');
    const restored = once<StateMessage>(replacement, 'game:state');
    const disconnected = once(clients[0]!, 'disconnect');
    replacement.emit('room:rejoin', { code, token: joined[0]!.sessionToken });
    await disconnected;
    expect((await rebound).playerId).toBe(joined[0]!.playerId);
    expect((await restored).view.yourHand).toEqual(views[0]!.yourHand);
    expect(server.store.get(code)!.players.size).toBe(2);
    expect(server.store.get(code)!.players.get(joined[0]!.playerId)!.socketId).toBe(replacement.id);
  });

  it('reserves a disconnected seat for 60 seconds, then releases it and ends the match', async () => {
    const { clients, joined, code } = await table('block');
    await ready(clients);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const roster = once<RoomMeta>(clients[1]!, 'room:state');
    clients[0]!.disconnect();
    const offline = await roster;
    expect(offline.seats.find((p) => p.id === joined[0]!.playerId)?.connected).toBe(false);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(server.store.get(code)!.players.has(joined[0]!.playerId)).toBe(true);
    const ended = once(clients[1]!, 'game:ended', 65_000);
    await vi.advanceTimersByTimeAsync(1);
    vi.useRealTimers();
    await ended;
    expect(server.store.get(code)!.players.has(joined[0]!.playerId)).toBe(false);
    expect(getGameState(server.store, code)).toBeUndefined();
    const replacement = await client();
    const denied = once<{ reason: string }>(replacement, 'room:error');
    replacement.emit('room:rejoin', { code, token: joined[0]!.sessionToken });
    expect((await denied).reason).toContain('invalid');
  });

  it('relays chat and WebRTC signals only within the sender room, without leaking tokens', async () => {
    const { clients, joined, code } = await table('block');
    const other = await table('block');
    const signals: unknown[] = [];
    other.clients[0]!.on('signal:offer', (value: unknown) => signals.push(value));
    clients[0]!.emit('signal:offer', {
      to: other.joined[0]!.playerId,
      sdp: { type: 'offer', sdp: 'test' },
    });
    const received = once<{ from: string }>(clients[1]!, 'signal:offer');
    clients[0]!.emit('signal:offer', {
      to: joined[1]!.playerId,
      sdp: { type: 'offer', sdp: 'test' },
    });
    expect((await received).from).toBe(joined[0]!.playerId);
    const chat = once<{ text: string }>(clients[1]!, 'chat');
    clients[0]!.emit('chat', { text: 'Hello' });
    expect((await chat).text).toBe('Hello');
    expect(signals).toEqual([]);
    const response = await fetch(`${url}/api/rooms/${code}`);
    const metadata = JSON.stringify(await response.json());
    for (const entry of joined) expect(metadata).not.toContain(entry.sessionToken);
  });
});
