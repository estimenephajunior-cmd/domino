import type { MutatorConfig } from '../shared/phaseFive.js';
import type { Server, Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { RULE_VARIANTS, type RuleVariant, type RoomSeat } from '../shared/types.js';
import { SoundboardLimiter, isSoundEffectId } from '../shared/social.js';
import type { RoomStore } from './rooms.js';
import { endRoomGame, getGameState, maybeStartHand, sendGameStateTo } from './game.js';
import { anonymousProfileId, touchLedgerPlayer } from './ledger.js';

const joinSchema = z.object({
  code: z.string().min(3).max(64),
  name: z.string().trim().min(3).max(24),
  profileId: z.string().regex(/^guest-[A-Za-z0-9_-]{16,64}$/).optional(),
});

const chatSchema = z.object({
  text: z.string().min(1).max(500),
});

const variantSchema = z.enum(RULE_VARIANTS as unknown as [RuleVariant, ...RuleVariant[]]);

const signalSchema = z.object({
  to: z.string().min(1),
  sdp: z.object({ type: z.enum(['offer', 'answer']), sdp: z.string().max(65536) }).optional(),
  candidate: z
    .object({
      candidate: z.string().max(4096),
      sdpMid: z.string().nullable().optional(),
      sdpMLineIndex: z.number().int().nullable().optional(),
      usernameFragment: z.string().nullable().optional(),
    })
    .optional(),
});

/** Per-socket identity so we can route WebRTC signalling between peers. */
interface SocketData {
  playerId: string;
  roomCode: string | null;
  name: string;
  profileId: string;
}

export function attachSignaling(io: Server, store: RoomStore): void {
  io.on('connection', (socket: Socket) => {
    const data: SocketData = {
      playerId: nanoid(10),
      roomCode: null,
      name: '',
      profileId: anonymousProfileId(),
    };
    socket.data = data;
    let windowStart = Date.now();
    let eventCount = 0;
    const soundboardLimiter = new SoundboardLimiter();
    let lastSoundAt: number | null = null;
    socket.use((_packet, next) => {
      if (Date.now() - windowStart > 10_000) {
        windowStart = Date.now();
        eventCount = 0;
      }
      if (++eventCount > 120) return next(new Error('Too many events'));
      next();
    });

    socket.on('room:create', (payload: unknown) => {
      const parsed = z
        .object({
          variant: variantSchema.optional(),
          name: z.string().trim().min(3).max(24),
          profileId: z.string().regex(/^guest-[A-Za-z0-9_-]{16,64}$/).optional(),
        })
        .safeParse(payload ?? {});
      if (!parsed.success) {
        socket.emit('room:error', { reason: 'Enter an alias of 3 to 24 characters.' });
        return;
      }
      if (parsed.data.variant === 'caribbean' || parsed.data.variant === 'all-fives') {
        socket.emit('room:error', { reason: 'That game variant is not available.' });
        return;
      }
      const room = store.create(parsed.data.variant ?? 'block');
      // The creator is seated immediately, under their chosen display name.
      joinRoom(
        socket,
        store,
        room.code,
        data,
        parsed.data.name,
        parsed.data.profileId ?? anonymousProfileId(),
      );
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
      if (!room.players.has(data.playerId) && room.players.size >= room.maxPlayers) {
        socket.emit('room:full');
        return;
      }
      if (getGameState(store, code) && !room.players.has(data.playerId)) {
        socket.emit('room:error', { reason: 'This match has already started.' });
        return;
      }
      joinRoom(socket, store, code, data, name, parsed.data.profileId ?? anonymousProfileId());
    });

    socket.on('room:leave', () => {
      leaveRoom(socket, store, data);
      socket.emit('room:left');
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

    socket.on('social:sound', (payload: unknown) => {
      const parsed = z
        .object({ id: z.string().min(8).max(80), effect: z.string(), at: z.number().finite() })
        .strict()
        .safeParse(payload);
      const room = data.roomCode ? store.get(data.roomCode) : undefined;
      const player = room?.players.get(data.playerId);
      if (!parsed.success || !room || !player || player.socketId !== socket.id) return;
      if (!isSoundEffectId(parsed.data.effect)) return;
      const now = Date.now();
      const decision = soundboardLimiter.consume(lastSoundAt, now);
      if (!decision.allowed) {
        socket.emit('social:sound-rejected', { reason: decision.reason });
        return;
      }
      lastSoundAt = now;
      socket.to(room.code).emit('social:sound', {
        id: parsed.data.id,
        effect: parsed.data.effect,
        playerId: data.playerId,
        name: data.name,
        at: now,
      });
    });

    socket.on('room:ready', (payload: unknown) => {
      const parsed = z.object({ ready: z.boolean() }).safeParse(payload);
      if (!parsed.success) return;
      const room = data.roomCode ? store.get(data.roomCode) : undefined;
      if (!room) return;
      const player = room.players.get(data.playerId);
      if (!player || player.socketId !== socket.id || getGameState(store, room.code)) return;
      room.players.set(data.playerId, { ...player, ready: parsed.data.ready });
      broadcastRoomState(ioOf(socket), room);
      // A ready flip may satisfy the deal condition — try to start the hand.
      maybeStartHand(ioOf(socket), store, room.code);
    });

    // Reclaim a reserved seat after a disconnect using the session token.
    socket.on('room:rejoin', (payload: unknown) => {
      const parsed = z
        .object({ code: z.string().min(3).max(64), token: z.string().min(8).max(64) })
        .safeParse(payload);
      if (!parsed.success) return;
      const room = store.get(parsed.data.code);
      if (!room) {
        socket.emit('room:error', { reason: 'room not found' });
        return;
      }
      const entry = [...room.players.values()].find((p) => p.sessionToken === parsed.data.token);
      if (!entry) {
        socket.emit('room:error', { reason: 'invalid session token' });
        return;
      }
      if (data.roomCode && (data.roomCode !== room.code || data.playerId !== entry.id)) {
        leaveRoom(socket, store, data);
      }
      if (entry.socketId && entry.socketId !== socket.id) {
        const previous = io.sockets.sockets.get(entry.socketId);
        if (previous) {
          (previous.data as SocketData).roomCode = null;
          previous.leave(room.code);
          previous.disconnect(true);
        }
      }
      // Rebind the seat to this fresh socket, preserving id/name/seat/ready.
      data.playerId = entry.id;
      data.roomCode = room.code;
      data.name = entry.name;
      data.profileId = entry.profileId ?? anonymousProfileId();
      touchLedgerPlayer(store, data.profileId, entry.name);
      clearSeatReservation(entry.id);
      room.players.set(entry.id, { ...entry, socketId: socket.id });
      socket.join(room.code);
      socket.emit('room:rejoined', {
        meta: roomMeta(room),
        playerId: entry.id,
        sessionToken: entry.sessionToken,
      });
      broadcastRoomState(ioOf(socket), room);
      // Re-send the authoritative view so the returning player immediately
      // sees their rack and the current chain (a live hand is not rebroadcast).
      sendGameStateTo(ioOf(socket), store, room.code, entry.id);
    });

    socket.on('room:mutators', (payload: unknown) => {
      const parsed = z
        .object({
          mutators: z
            .object({ speed: z.boolean(), wildDouble: z.boolean(), hotPotato: z.boolean() })
            .partial()
            .strict()
            .refine((patch) => Object.keys(patch).length > 0),
        })
        .safeParse(payload);
      if (!parsed.success) {
        socket.emit('room:error', { reason: 'Invalid mutator settings.' });
        return;
      }
      const room = data.roomCode ? store.get(data.roomCode) : undefined;
      if (!room || room.players.get(data.playerId)?.socketId !== socket.id) return;
      if ([...room.players.values()][0]?.id !== data.playerId) {
        socket.emit('room:error', { reason: 'Only the host can change settings.' });
        return;
      }
      if (getGameState(store, room.code)) {
        socket.emit('room:error', { reason: 'Settings are locked during a match.' });
        return;
      }
      room.mutators = { ...room.mutators, ...parsed.data.mutators };
      for (const [id, player] of room.players) room.players.set(id, { ...player, ready: false });
      broadcastRoomState(io, room);
    });

    socket.on('room:variant', (payload: unknown) => {
      const parsed = z.object({ variant: variantSchema }).safeParse(payload);
      if (!parsed.success || parsed.data.variant === 'caribbean' || parsed.data.variant === 'all-fives') return;
      const room = data.roomCode ? store.get(data.roomCode) : undefined;
      if (!room) return;
      // Only the first seat (host) may change the variant.
      const players = [...room.players.values()];
      if (players[0]?.id !== data.playerId) {
        socket.emit('room:error', { reason: 'Only the host can change settings.' });
        return;
      }
      if (getGameState(store, room.code)) {
        socket.emit('room:error', { reason: 'Settings are locked during a match.' });
        return;
      }
      room.variant = parsed.data.variant;
      for (const [id, player] of room.players) room.players.set(id, { ...player, ready: false });
      broadcastRoomState(io, room);
    });

    // ---- WebRTC signalling relay (offer / answer / ICE) ----
    socket.on('voice:state', (payload: unknown, acknowledged?: () => void) => {
      const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(payload);
      const room = data.roomCode ? store.get(data.roomCode) : undefined;
      const player = room?.players.get(data.playerId);
      if (!parsed.success || !room || !player || player.socketId !== socket.id) return;
      room.players.set(player.id, { ...player, voiceEnabled: parsed.data.enabled });
      broadcastRoomState(io, room);
      if (typeof acknowledged === 'function') acknowledged();
    });
    socket.on('signal:offer', (payload: unknown) =>
      relay(io, store, data, payload, 'signal:offer'),
    );
    socket.on('signal:answer', (payload: unknown) =>
      relay(io, store, data, payload, 'signal:answer'),
    );
    socket.on('signal:ice', (payload: unknown) => relay(io, store, data, payload, 'signal:ice'));

    socket.on('disconnect', () => {
      // Reserve the seat briefly so a reconnect (via session token) can reclaim
      // it — see roadmap §23. Explicit `room:leave` still removes immediately.
      reserveSeatOnDisconnect(ioOf(socket), store, data);
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
  if (
    event === 'signal:ice'
      ? !parsed.data.candidate
      : parsed.data.sdp?.type !== (event === 'signal:offer' ? 'offer' : 'answer')
  )
    return;
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
  profileId: string,
): void {
  const room = store.get(code);
  if (!room) {
    socket.emit('room:error', { reason: 'room not found' });
    return;
  }
  // A client that already holds a seat must not consume a second one: drop
  // the stale seat first so the roster stays accurate.
  if (data.roomCode && data.roomCode !== code) {
    leaveRoom(socket, store, data);
  }
  const existing = room.players.get(data.playerId);
  if (existing) {
    // Re-joining the same room: keep the seat, refresh the socket binding.
    data.roomCode = code;
    data.name = name;
    data.profileId = existing.profileId ?? profileId;
    touchLedgerPlayer(store, data.profileId, name);
    room.players.set(data.playerId, { ...existing, name, socketId: socket.id });
    socket.join(code);
    socket.emit('room:joined', {
      meta: roomMeta(room),
      playerId: data.playerId,
      sessionToken: existing.sessionToken,
    });
    broadcastRoomState(ioOf(socket), room);
    sendGameStateTo(ioOf(socket), store, code, data.playerId);
    return;
  }
  data.roomCode = code;
  data.name = name;
  data.profileId = profileId;
  touchLedgerPlayer(store, profileId, name);

  const seat = room.players.size;
  const sessionToken = nanoid(24);
  room.players.set(data.playerId, {
    id: data.playerId,
    name,
    socketId: socket.id,
    ready: false,
    seat,
    sessionToken,
    profileId,
  });

  socket.join(code);
  // Hand the client its secret reconnect token (store it in sessionStorage).
  socket.emit('room:joined', { meta: roomMeta(room), playerId: data.playerId, sessionToken });
  broadcastRoomState(ioOf(socket), room);
}

function leaveRoom(socket: Socket, store: RoomStore, data: SocketData): void {
  if (!data.roomCode) return;
  const room = store.get(data.roomCode);
  if (room) {
    clearSeatReservation(data.playerId);
    room.players.delete(data.playerId);
    endRoomGame(ioOf(socket), store, room.code);
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

/** Pending seat-reservation timers, keyed by playerId (cleared on rejoin). */
const seatReservations = new Map<string, NodeJS.Timeout>();

/** How long a disconnected player keeps their seat before it is freed. */
const SEAT_RESERVATION_MS = 60_000;

/**
 * On socket disconnect, keep the player (and their hand) reserved for
 * `SEAT_RESERVATION_MS` so they can rejoin with their session token. After the
 * window, the seat is released and the room state is rebroadcast.
 */
function reserveSeatOnDisconnect(io: Server, store: RoomStore, data: SocketData): void {
  if (!data.roomCode) return;
  const room = store.get(data.roomCode);
  const code = data.roomCode;
  const playerId = data.playerId;
  if (!room) return;

  const player = room.players.get(playerId);
  if (player) {
    room.players.set(playerId, { ...player, socketId: null, voiceEnabled: false });
    broadcastRoomState(io, room);
  }

  // Replace any existing reservation for this player.
  const existing = seatReservations.get(playerId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    seatReservations.delete(playerId);
    const r = store.get(code);
    const p = r?.players.get(playerId);
    // Only free the seat if it is still reserved (not already rejoined).
    if (r && p && p.socketId === null) {
      r.players.delete(playerId);
      endRoomGame(io, store, code);
      if (r.players.size === 0) {
        store.delete(code);
      } else {
        let seat = 0;
        for (const [id, pl] of r.players) {
          r.players.set(id, { ...pl, seat: seat++ });
        }
        broadcastRoomState(io, r);
      }
    }
  }, SEAT_RESERVATION_MS);
  timer.unref?.();
  seatReservations.set(playerId, timer);

  data.roomCode = null;
}

/** Cancel a pending seat reservation (called when a player rejoins). */
export function clearSeatReservation(playerId: string): void {
  const timer = seatReservations.get(playerId);
  if (timer) {
    clearTimeout(timer);
    seatReservations.delete(playerId);
  }
}

/** Small helper so we can reach the Server instance from a Socket. */
function ioOf(socket: Socket): Server {
  return socket.nsp.server as Server;
}

export interface RoomMetaPayload {
  mutators?: MutatorConfig;
  code: string;
  createdAt: number;
  variant: RuleVariant;
  playerCount: number;
  maxPlayers: number;
  seats: RoomSeat[];
}

export function roomMeta(room: {
  mutators?: MutatorConfig;
  code: string;
  createdAt: number;
  variant: RuleVariant;
  players: Map<
    string,
    {
      id: string;
      name: string;
      seat: number;
      ready: boolean;
      socketId?: string | null;
      voiceEnabled?: boolean;
    }
  >;
  maxPlayers: number;
}): RoomMetaPayload {
  return {
    code: room.code,
    mutators: room.mutators,
    createdAt: room.createdAt,
    variant: room.variant,
    playerCount: room.players.size,
    maxPlayers: room.maxPlayers,
    // Seats are sorted so every client renders the same left-to-right order.
    seats: [...room.players.values()]
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        ready: p.ready,
        connected: p.socketId !== null,
        voiceEnabled: p.voiceEnabled === true,
      })),
  };
}

export function broadcastRoomState(ioServer: Server, room: Parameters<typeof roomMeta>[0]): void {
  ioServer.to(room.code).emit('room:state', roomMeta(room));
}
