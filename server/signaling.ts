import type { Server, Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { RULE_VARIANTS, type RuleVariant } from '../shared/types.js';
import type { RoomStore } from './rooms.js';

const joinSchema = z.object({
  code: z.string().min(3).max(64),
  name: z.string().min(1).max(24),
});

const chatSchema = z.object({
  text: z.string().min(1).max(500),
});

const variantSchema = z.enum(RULE_VARIANTS as unknown as [RuleVariant, ...RuleVariant[]]);

const signalSchema = z.object({
  to: z.string().min(1),
  sdp: z.any().optional(),
  candidate: z.any().optional(),
});

/** Per-socket identity so we can route WebRTC signalling between peers. */
interface SocketData {
  playerId: string;
  roomCode: string | null;
  name: string;
}

export function attachSignaling(io: Server, store: RoomStore): void {
  io.on('connection', (socket: Socket) => {
    const data: SocketData = {
      playerId: nanoid(10),
      roomCode: null,
      name: 'Player',
    };
    socket.data = data;

    socket.on('room:create', (payload: unknown) => {
      const parsed = z
        .object({ variant: variantSchema.optional() })
        .safeParse(payload ?? {});
      if (!parsed.success) {
        socket.emit('room:error', { reason: 'invalid variant' });
        return;
      }
      const room = store.create(parsed.data.variant ?? 'block');
      joinRoom(socket, store, room.code, data, 'Player 1');
    });

    socket.on('room:join', (payload: unknown) => {
      const parsed = joinSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit('room:error', { reason: 'invalid join payload' });
        return;
      }
      const { code, name } = parsed.data;
      const room = store.get(code);
      if (!room) {
        socket.emit('room:error', { reason: 'room not found' });
        return;
      }
      if (room.players.size >= room.maxPlayers) {
        socket.emit('room:full');
        return;
      }
      joinRoom(socket, store, code, data, name);
    });

    socket.on('room:leave', () => {
      leaveRoom(socket, store, data);
    });

    socket.on('chat', (payload: unknown) => {
      const parsed = chatSchema.safeParse(payload);
      if (!parsed.success) return;
      const room = data.roomCode ? store.get(data.roomCode) : undefined;
      if (!room) return;
      const entry = {
        playerId: data.playerId,
        name: data.name,
        text: parsed.data.text,
        at: Date.now(),
      };
      room.chat.push(entry);
      if (room.chat.length > 200) room.chat.shift();
      io.to(room.code).emit('chat', entry);
    });

    socket.on('room:ready', (payload: unknown) => {
      const parsed = z.object({ ready: z.boolean() }).safeParse(payload);
      if (!parsed.success) return;
      const room = data.roomCode ? store.get(data.roomCode) : undefined;
      if (!room) return;
      const player = room.players.get(data.playerId);
      if (!player) return;
      room.players.set(data.playerId, { ...player, ready: parsed.data.ready });
      broadcastRoomState(io, room);
    });

    socket.on('room:variant', (payload: unknown) => {
      const parsed = z.object({ variant: variantSchema }).safeParse(payload);
      if (!parsed.success) return;
      const room = data.roomCode ? store.get(data.roomCode) : undefined;
      if (!room) return;
      // Only the first seat (host) may change the variant.
      const players = [...room.players.values()];
      if (players[0]?.id !== data.playerId) return;
      room.variant = parsed.data.variant;
      broadcastRoomState(io, room);
    });

    // ---- WebRTC signalling relay (offer / answer / ICE) ----
    socket.on('signal:offer', (payload: unknown) => relay(io, store, data, payload, 'signal:offer'));
    socket.on('signal:answer', (payload: unknown) => relay(io, store, data, payload, 'signal:answer'));
    socket.on('signal:ice', (payload: unknown) => relay(io, store, data, payload, 'signal:ice'));

    socket.on('disconnect', () => {
      leaveRoom(socket, store, data);
    });
  });
}

function relay(
  io: Server,
  store: RoomStore,
  data: SocketData,
  payload: unknown,
  event: 'signal:offer' | 'signal:answer' | 'signal:ice',
): void {
  const parsed = signalSchema.safeParse(payload);
  if (!parsed.success) return;
  const room = data.roomCode ? store.get(data.roomCode) : undefined;
  if (!room) return;
  const target = room.players.get(parsed.data.to);
  if (!target?.socketId) return;
  const body =
    event === 'signal:ice'
      ? { from: data.playerId, candidate: parsed.data.candidate }
      : { from: data.playerId, sdp: parsed.data.sdp };
  io.to(target.socketId).emit(event, body);
}


function joinRoom(
  socket: Socket,
  store: RoomStore,
  code: string,
  data: SocketData,
  name: string,
): void {
  const room = store.get(code);
  if (!room) {
    socket.emit('room:error', { reason: 'room not found' });
    return;
  }
  data.roomCode = code;
  data.name = name;

  const seat = room.players.size;
  room.players.set(data.playerId, {
    id: data.playerId,
    name,
    socketId: socket.id,
    ready: false,
    seat,
  });

  socket.join(code);
  socket.emit('room:joined', { meta: roomMeta(room) });
  broadcastRoomState(ioOf(socket), room);
}

function leaveRoom(socket: Socket, store: RoomStore, data: SocketData): void {
  if (!data.roomCode) return;
  const room = store.get(data.roomCode);
  if (room) {
    room.players.delete(data.playerId);
    socket.leave(data.roomCode);
    if (room.players.size === 0) {
      store.delete(room.code);
    } else {
      // Re-seat remaining players so seat indices stay contiguous.
      let seat = 0;
      for (const [id, player] of room.players) {
        room.players.set(id, { ...player, seat: seat++ });
      }
      broadcastRoomState(ioOf(socket), room);
    }
  }
  data.roomCode = null;
}

/** Small helper so we can reach the Server instance from a Socket. */
function ioOf(socket: Socket): Server {
  return socket.nsp.server as Server;
}

export interface RoomMetaPayload {
  code: string;
  createdAt: number;
  variant: RuleVariant;
  playerCount: number;
  maxPlayers: number;
}

export function roomMeta(room: {
  code: string;
  createdAt: number;
  variant: RuleVariant;
  players: Map<string, { ready: boolean }>;
  maxPlayers: number;
}): RoomMetaPayload {
  return {
    code: room.code,
    createdAt: room.createdAt,
    variant: room.variant,
    playerCount: room.players.size,
    maxPlayers: room.maxPlayers,
  };
}

export function broadcastRoomState(ioServer: Server, room: Parameters<typeof roomMeta>[0]): void {
  ioServer.to(room.code).emit('room:state', roomMeta(room));
}
