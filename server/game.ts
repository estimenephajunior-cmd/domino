import { PhaseFiveSession } from './phaseFive.js';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { ENDS, VARIANT_RULES, type PlayerView, type ShuffleProof } from '../shared/types.js';
import type { DominosState } from '../shared/dominosGame.js';
import { handSizeFor } from '../shared/rules.js';
import { BWAS_MIX_MS } from '../shared/moves.js';
import { makeNonce, type RoomStore } from './rooms.js';
import { GameRuntime } from './gameRuntime.js';
import { createShuffleProof } from './fairness.js';
import { recordCompletedHand } from './ledger.js';

interface TableGame {
  runtime: GameRuntime;
  proof: ShuffleProof;
  features: PhaseFiveSession;
}
const registries = new WeakMap<RoomStore, Map<string, TableGame>>();
function registry(store: RoomStore): Map<string, TableGame> {
  let games = registries.get(store);
  if (!games) {
    games = new Map();
    registries.set(store, games);
  }
  return games;
}

export type { PlayerView };

/** Never serialize engine logs, boneyard order or live shuffle secrets. */
export function toPlayerView(
  state: DominosState,
  requesterId: string,
  proof?: ShuffleProof,
): PlayerView {
  const finished = state.phase === 'hand-complete';
  return {
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      handCount: p.hand.length,
      score: p.score,
      seated: p.seated,
    })),
    chain: state.chain,
    boneyardCount: state.boneyard.length,
    phase: state.phase,
    currentPlayer: state.currentPlayer,
    turn: state.turn,
    variant: state.variant,
    winner: state.winner,
    lastMove: state.lastMove,
    seed: finished ? state.seed : '',
    fairness: proof ? { commitment: proof.commitment, reveal: finished ? proof : null } : undefined,
    yourHand: state.players.find((p) => p.id === requesterId)?.hand ?? [],
    handNumber: state.handNumber,
    blocked: state.blocked,
    drawing: state.drawing,
    dealerId: state.dealerId,
    currentPickerId: state.currentPickerId,
    mixingEndsAt: state.mixingEndsAt,
    dealSlots: state.dealSlots.map((slot) => ({ id: slot.id, claimed: slot.claimedBy !== null })),
    picksByPlayer: Object.fromEntries(
      state.players.map((player) => [player.id, player.hand.length]),
    ),
    publicActions: state.publicActions,
  };
}

function broadcastGame(io: Server, store: RoomStore, code: string): void {
  const room = store.get(code);
  if (!room) return;
  const game = registry(store).get(code);
  const state = game?.runtime.game;
  if (state?.phase === 'hand-complete') recordCompletedHand(store, room, state, game?.proof.commitment);
  for (const player of room.players.values()) sendGameStateTo(io, store, code, player.id);
}

export function sendGameStateTo(
  io: Server,
  store: RoomStore,
  code: string,
  playerId: string,
): void {
  const game = registry(store).get(code);
  const seat = store.get(code)?.players.get(playerId);
  if (!game || !seat?.socketId) return;
  io.to(seat.socketId).emit('game:state', {
    playerId,
    view: {
      ...toPlayerView(game.runtime.game, playerId, game.proof),
      phaseFive: game.features.view(),
    },
  });
}

export function maybeStartHand(io: Server, store: RoomStore, code: string): void {
  const room = store.get(code);
  if (!room || room.players.size < 2 || registry(store).has(code)) return;
  const seats = [...room.players.values()].sort((a, b) => a.seat - b.seat);
  if (!seats.every((p) => p.ready && p.socketId)) return;
  if (VARIANT_RULES[room.variant].partnership && seats.length !== 4) return;
  const seed = makeNonce();
  const proof = createShuffleProof(room.variant, seed);
  // Publish the commitment before any private deal is delivered.
  io.to(code).emit('game:commitment', { handNumber: 1, commitment: proof.commitment });
  const runtime = new GameRuntime({
    players: seats.map((p) => ({ id: p.id, name: p.name })),
    variant: room.variant,
    seed,
    handSize: handSizeFor(room.variant, seats.length),
    mutators: room.mutators,
  });
  const features = new PhaseFiveSession(runtime, () => broadcastGame(io, store, code));
  registry(store).set(code, { runtime, proof, features });
  broadcastGame(io, store, code);
}

export function getGameState(store: RoomStore, code: string): DominosState | undefined {
  return registry(store).get(code)?.runtime.game;
}

/** Leaving or expiring a seat returns the remaining players to a fresh lobby. */
export function endRoomGame(io: Server, store: RoomStore, code: string): void {
  registry(store).get(code)?.features.dispose();
  if (!registry(store).delete(code)) return;
  const room = store.get(code);
  if (room)
    for (const [id, player] of room.players) room.players.set(id, { ...player, ready: false });
  io.to(code).emit('game:ended', { reason: 'A seat was released. Ready up to start a new match.' });
}

export function disposeGames(store: RoomStore): void {
  for (const game of registry(store).values()) game.features.dispose();
  registry(store).clear();
}

const playSchema = z.object({
  velocity: z.number().finite().min(0).max(8).optional(),
  tileId: z.string().min(1).max(16),
  end: z.enum(ENDS as [(typeof ENDS)[number], ...(typeof ENDS)[number][]]),
});

export function attachGameHandlers(
  io: Server,
  store: RoomStore,
  options: { readonly mixDurationMs?: number } = {},
): void {
  io.on('connection', (socket: Socket) => {
    const data = socket.data as { playerId: string; roomCode: string | null };
    function move(
      type: 'playTile' | 'drawTile' | 'pass' | 'nextHand',
      args: readonly unknown[] = [],
      velocity = 0,
    ): void {
      const code = data.roomCode;
      const room = code ? store.get(code) : undefined;
      const game = code ? registry(store).get(code) : undefined;
      if (!code || !room || !game || room.players.get(data.playerId)?.socketId !== socket.id)
        return;
      game.features.synchronize();
      if (game.features.voting) {
        socket.emit('game:error', { reason: 'Moves are paused during the undo vote.' });
        return;
      }
      const state = game.runtime.game;
      if (type !== 'nextHand' && state.currentPlayer !== data.playerId) {
        socket.emit('game:error', { reason: 'It is not your turn.' });
        return;
      }
      if (
        type === 'playTile' &&
        !state.players.find((p) => p.id === data.playerId)?.hand.some((t) => t.id === args[0])
      ) {
        socket.emit('game:error', { reason: 'That tile is not in your hand.' });
        return;
      }
      const checkpoint = game.features.checkpoint();
      const seed = type === 'nextHand' ? makeNonce() : null;
      if (!game.runtime.move(data.playerId, type, seed ? [seed] : args)) {
        socket.emit('game:error', { reason: 'That action is not legal in the current hand.' });
        return;
      }
      game.features.committed(type, checkpoint);
      if (type === 'playTile')
        io.to(code).emit('game:placement', { tileId: args[0], playerId: data.playerId, velocity });
      if (seed) {
        game.proof = createShuffleProof(state.variant, seed);
        io.to(code).emit('game:commitment', {
          handNumber: game.runtime.game.handNumber,
          commitment: game.proof.commitment,
        });
      }
      broadcastGame(io, store, code);
    }
    function undoAction(action: (features: PhaseFiveSession) => string | null): void {
      const code = data.roomCode;
      const room = code ? store.get(code) : undefined;
      const game = code ? registry(store).get(code) : undefined;
      if (!game || room?.players.get(data.playerId)?.socketId !== socket.id) return;
      const reason = action(game.features);
      if (reason) socket.emit('game:error', { reason });
    }
    socket.on('game:undo-request', () => undoAction((features) => features.request(data.playerId)));
    socket.on('game:undo-vote', (payload: unknown) => {
      const parsed = z
        .object({ voteId: z.string().min(1).max(32), approve: z.boolean() })
        .safeParse(payload);
      if (!parsed.success) {
        socket.emit('game:error', { reason: 'Invalid undo vote.' });
        return;
      }
      undoAction((features) =>
        features.cast(data.playerId, parsed.data.voteId, parsed.data.approve),
      );
    });
    socket.on('game:ready', () => {
      if (data.roomCode) maybeStartHand(io, store, data.roomCode);
    });
    socket.on('game:mix', () => {
      const code = data.roomCode;
      const room = code ? store.get(code) : undefined;
      const game = code ? registry(store).get(code) : undefined;
      if (!code || !game || room?.players.get(data.playerId)?.socketId !== socket.id) return;
      const duration = Math.max(0, Math.min(BWAS_MIX_MS, options.mixDurationMs ?? BWAS_MIX_MS));
      if (!game.runtime.move(data.playerId, 'mixTiles', [Date.now() - (BWAS_MIX_MS - duration)])) {
        socket.emit('game:error', { reason: 'Only the current dealer can mix these tiles.' });
        return;
      }
      broadcastGame(io, store, code);
      if (duration > 0) {
        const deadline = game.runtime.game.mixingEndsAt;
        const timer = setTimeout(() => {
          const current = registry(store).get(code);
          if (
            !current ||
            current.runtime.game.phase !== 'mixing' ||
            current.runtime.game.mixingEndsAt !== deadline
          )
            return;
          if (current.runtime.move(data.playerId, 'finishMixing', [deadline]))
            broadcastGame(io, store, code);
        }, duration + 5);
        timer.unref();
      }
    });
    socket.on('game:pick', (payload: unknown) => {
      const parsed = z.object({ slotId: z.string().regex(/^slot-\d{1,3}$/) }).safeParse(payload);
      if (!parsed.success) {
        socket.emit('game:error', { reason: 'Invalid tile pick.' });
        return;
      }
      const code = data.roomCode;
      const room = code ? store.get(code) : undefined;
      const game = code ? registry(store).get(code) : undefined;
      if (!code || !game || room?.players.get(data.playerId)?.socketId !== socket.id) return;
      const checkpoint = game.features.checkpoint();
      if (!game.runtime.move(data.playerId, 'pickTile', [parsed.data.slotId, Date.now()])) {
        socket.emit('game:error', { reason: 'That tile cannot be picked now.' });
        return;
      }
      if (game.runtime.game.phase === 'awaiting-play')
        game.features.committed('nextHand', checkpoint);
      broadcastGame(io, store, code);
    });
    socket.on('game:play', (payload: unknown) => {
      const parsed = playSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit('game:error', { reason: 'Invalid play payload.' });
        return;
      }
      move('playTile', [parsed.data.tileId, parsed.data.end], parsed.data.velocity ?? 0);
    });
    socket.on('game:draw', () => move('drawTile'));
    socket.on('game:pass', () => move('pass'));
    socket.on('game:next-hand', () => move('nextHand'));
  });
}
