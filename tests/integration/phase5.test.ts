/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { createServerInstance } from '../../server/index.js';
import { createMemoryStore } from '../../server/rooms.js';
import { getGameState } from '../../server/game.js';
import { legalMoves } from '../../shared/engine.js';
import { DEFAULT_MUTATORS } from '../../shared/mutators.js';
import type { PlayerView, RoomMeta } from '../../shared/types.js';
import type { MutatorConfig } from '../../shared/phaseFive.js';

interface Joined {
  meta: RoomMeta;
  playerId: string;
  sessionToken: string;
}
interface Message {
  playerId: string;
  view: PlayerView;
}
function once<T>(
  socket: Socket,
  event: string,
  timeout = 6000,
  accept: (value: T) => boolean = () => true,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const listener = (value: T) => {
      if (!accept(value)) return;
      socket.off(event, listener);
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Waiting for ${event}`));
    }, timeout);
    socket.on(event, listener);
  });
}

describe('phase 5 authoritative socket flow', () => {
  let server: ReturnType<typeof createServerInstance>;
  let sockets: Socket[];
  let url: string;
  beforeEach(async () => {
    sockets = [];
    server = createServerInstance(createMemoryStore(), { mixDurationMs: 0 });
    await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await new Promise<void>((resolve) => server.io.close(() => resolve()));
    server.store.db.close();
  });
  async function room(config: MutatorConfig = DEFAULT_MUTATORS) {
    const clients: Socket[] = [];
    const seats: Joined[] = [];
    for (let index = 0; index < 2; index++) {
      const socket = connect(url, { transports: ['websocket'], reconnection: false });
      sockets.push(socket);
      clients.push(socket);
      await once(socket, 'connect');
      const joined = once<Joined>(socket, 'room:joined');
      socket.emit(
        index === 0 ? 'room:create' : 'room:join',
        index === 0
          ? { variant: 'draw', name: 'Host' }
          : { code: seats[0]!.meta.code, name: 'Guest' },
      );
      seats.push(await joined);
    }
    const metadata = once<RoomMeta>(
      clients[0]!,
      'room:state',
      6000,
      (value) => JSON.stringify(value.mutators) === JSON.stringify(config),
    );
    clients[0]!.emit('room:mutators', { mutators: config });
    expect((await metadata).mutators).toEqual(config);
    const pending = clients.map((socket) => once<Message>(socket, 'game:state'));
    clients.forEach((socket) => socket.emit('room:ready', { ready: true }));
    let views = (await Promise.all(pending)).map((message) => message.view);
    const dealer = views[0]!.players.findIndex((player) => player.id === views[0]!.dealerId);
    const mixed = clients.map((socket) => once<Message>(socket, 'game:state'));
    clients[dealer]!.emit('game:mix');
    views = (await Promise.all(mixed)).map((message) => message.view);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(views[0]!.mixingEndsAt!);
    try {
      while (views[0]!.phase !== 'awaiting-play') {
        const pickerId = views[0]!.players.find((player) => player.handCount < 7)!.id;
        const picker = views[0]!.players.findIndex((player) => player.id === pickerId);
        const slotId = views[0]!.dealSlots.find((slot) => !slot.claimed)!.id;
        const updates = clients.map((socket) => once<Message>(socket, 'game:state'));
        clients[picker]!.emit('game:pick', { slotId });
        views = (await Promise.all(updates)).map((message) => message.view);
      }
    } finally {
      clock.mockRestore();
    }
    return { clients, seats, views, code: seats[0]!.meta.code };
  }
  async function action(clients: Socket[], socket: Socket, event: string, payload?: unknown) {
    const pending = clients.map((client) => once<Message>(client, 'game:state'));
    socket.emit(event, payload);
    return (await Promise.all(pending)).map((message) => message.view);
  }
  async function placement(table: Awaited<ReturnType<typeof room>>) {
    let views = table.views;
    for (let guard = 0; guard < 60; guard++) {
      const mover = table.seats.findIndex((seat) => seat.playerId === views[0]!.currentPlayer);
      const view = views[mover]!;
      const choice = legalMoves(view.yourHand, view.chain, view.variant)[0];
      if (choice && view.yourHand.length > 1) {
        const before = getGameState(server.store, table.code)!;
        const after = await action(table.clients, table.clients[mover]!, 'game:play', {
          tileId: choice.tile.id,
          end: choice.end,
        });
        return { actor: mover, before, after };
      }
      views = await action(
        table.clients,
        table.clients[mover]!,
        view.boneyardCount > 0 ? 'game:draw' : 'game:pass',
      );
    }
    throw new Error('No non-winning placement found');
  }

  it('rolls back the complete server state by majority vote and sends each private rack only to its owner', async () => {
    const table = await room({ speed: true, wildDouble: true, hotPotato: true });
    const { actor, before, after } = await placement(table);
    const voting = await action(table.clients, table.clients[actor]!, 'game:undo-request');
    const vote = voting[0]!.phaseFive!.undo.vote!;
    expect(voting.every((view) => view.phaseFive?.turnDeadline === null)).toBe(true);
    const pausedState = getGameState(server.store, table.code);
    const error = once<{ reason: string }>(table.clients[1 - actor]!, 'game:error');
    table.clients[1 - actor]!.emit('game:pass');
    expect((await error).reason).toContain('paused');
    expect(getGameState(server.store, table.code)).toBe(pausedState);
    const restored = await action(table.clients, table.clients[1 - actor]!, 'game:undo-vote', {
      voteId: vote.id,
      approve: true,
    });
    expect(getGameState(server.store, table.code)).toEqual(before);
    for (const [index, view] of restored.entries()) {
      expect(view.yourHand).toEqual(
        before.players.find((player) => player.id === table.seats[index]!.playerId)!.hand,
      );
      expect(view.players.every((player) => !('hand' in player))).toBe(true);
      expect(view.phaseFive!.undo.result).toBe('approved');
      expect(view.seed).toBe('');
      expect(JSON.stringify(view)).not.toContain(before.seed);
      expect(JSON.stringify(view.phaseFive)).not.toContain('snapshot');
      expect(view.fairness?.commitment).toBe(after[index]!.fairness?.commitment);
    }
    const stale = once<{ reason: string }>(table.clients[1 - actor]!, 'game:error');
    table.clients[1 - actor]!.emit('game:undo-vote', { voteId: vote.id, approve: true });
    expect((await stale).reason).toContain('no longer');
  });
  it('merges rapid partial host changes without overwriting other toggles and clears ready votes', async () => {
    const host = connect(url, { transports: ['websocket'], reconnection: false });
    sockets.push(host);
    await once(host, 'connect');
    const joined = once<Joined>(host, 'room:joined');
    host.emit('room:create', { variant: 'block', name: 'Host' });
    const code = (await joined).meta.code;
    const ready = once<RoomMeta>(
      host,
      'room:state',
      6000,
      (value) => value.seats[0]?.ready === true,
    );
    host.emit('room:ready', { ready: true });
    await ready;
    const configured = once<RoomMeta>(
      host,
      'room:state',
      6000,
      (value) => value.mutators?.speed === true && value.mutators.wildDouble === true,
    );
    host.emit('room:mutators', { mutators: { speed: true } });
    host.emit('room:mutators', { mutators: { wildDouble: true } });
    const meta = await configured;
    expect(meta.seats[0]!.ready).toBe(false);
    expect(server.store.get(code)!.mutators).toEqual({
      speed: true,
      wildDouble: true,
      hotPotato: false,
    });
    const invalid = once<{ reason: string }>(host, 'room:error');
    host.emit('room:mutators', { mutators: { unknown: true } });
    expect((await invalid).reason).toContain('Invalid');
  });

  it('rejects malformed votes, unauthorized settings and live mutator changes', async () => {
    const table = await room();
    const denied = once<{ reason: string }>(table.clients[1]!, 'room:error');
    table.clients[1]!.emit('room:mutators', {
      mutators: { speed: true, wildDouble: true, hotPotato: true },
    });
    expect((await denied).reason).toContain('host');
    const locked = once<{ reason: string }>(table.clients[0]!, 'room:error');
    table.clients[0]!.emit('room:mutators', { mutators: { ...DEFAULT_MUTATORS, speed: true } });
    expect((await locked).reason).toContain('locked');
    const malformed = once<{ reason: string }>(table.clients[0]!, 'game:error');
    table.clients[0]!.emit('game:undo-vote', { voteId: 12, approve: 'yes' });
    expect((await malformed).reason).toContain('Invalid');
    expect(server.store.get(table.code)!.mutators).toEqual(DEFAULT_MUTATORS);
  });
  it('advances an idle live table at the server deadline and publishes a buzzer sequence', async () => {
    const table = await room({ ...DEFAULT_MUTATORS, speed: true });
    const before = table.views[0]!;
    const pending = table.clients.map((socket) => once<Message>(socket, 'game:state', 14000));
    const next = await Promise.all(pending);
    expect(next.every(({ view }) => view.phaseFive?.timeoutSequence === 1)).toBe(true);
    expect(next[0]!.view.currentPlayer).not.toBe(before.currentPlayer);
    expect(next[0]!.view.turn).toBe(before.turn + 1);
    expect(next[0]!.view.phaseFive!.turnDeadline).toBeGreaterThan(before.phaseFive!.turnDeadline!);
  }, 20000);
  it('restores an active vote and paused clock on authenticated reconnect', async () => {
    const table = await room({ ...DEFAULT_MUTATORS, speed: true });
    const { actor } = await placement(table);
    const views = await action(table.clients, table.clients[actor]!, 'game:undo-request');
    const socket = connect(url, { transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    await once(socket, 'connect');
    const restored = once<Message>(socket, 'game:state');
    socket.emit('room:rejoin', { code: table.code, token: table.seats[1 - actor]!.sessionToken });
    const view = (await restored).view;
    expect(view.phaseFive!.undo.vote).toEqual(views[0]!.phaseFive!.undo.vote);
    expect(view.phaseFive!.turnDeadline).toBeNull();
    const pending = once<Message>(table.clients[actor]!, 'game:state');
    socket.emit('game:undo-vote', { voteId: view.phaseFive!.undo.vote!.id, approve: false });
    expect((await pending).view.phaseFive!.undo.result).toBe('rejected');
  });
});
