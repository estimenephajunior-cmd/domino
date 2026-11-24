import type { MutatorConfig } from '../../shared/phaseFive';
import { create } from 'zustand';
import type { Socket } from 'socket.io-client';
import type { End, PlayerView, RoomMeta, RuleVariant } from '../../shared/types';
import { ledgerProfileId } from '../ledger/profile';

export interface ChatMessage {
  readonly playerId: string;
  readonly name: string;
  readonly text: string;
  readonly at: number;
}

export interface Identity {
  readonly name: string;
}

interface TableState {
  // --- transport ---
  readonly socket: Socket | null;
  readonly connected: boolean;
  // --- identity / room ---
  readonly identity: Identity;
  readonly room: RoomMeta | null;
  readonly roomCode: string | null;
  readonly playerId: string | null;
  readonly sessionToken: string | null;
  readonly chat: readonly ChatMessage[];
  // --- authoritative snapshot (server truth, replaced wholesale) ---
  readonly view: PlayerView | null;
  // --- pure UI state ---
  readonly selectedTileId: string | null;
  readonly selectedEnd: End;
  readonly showChat: boolean;
  readonly error: string | null;
  readonly lastGameErrorAt: number;
  // --- voice state ---
  readonly lastPlayVelocity: number;
  readonly lastPlacement: { tileId: string; playerId: string; velocity: number } | null;

  // --- actions ---
  setSocket(socket: Socket | null): void;
  setConnected(connected: boolean): void;
  setIdentityName(name: string): void;
  setRoomCode(code: string | null): void;
  setRoom(meta: RoomMeta): void;
  handleJoined(meta: RoomMeta, playerId: string, sessionToken: string): void;
  pushChat(entry: ChatMessage): void;
  applyGameView(view: PlayerView): void;
  selectTile(tileId: string | null): void;
  chooseEnd(end: End): void;
  toggleChat(): void;
  setError(error: string | null): void;
  reset(): void;
  // --- voice actions ---
  recordPlacement(placement: { tileId: string; playerId: string; velocity: number }): void;

  // --- intent emitters (socket writes, no local game mutation) ---
  changeMutators(mutators: Partial<MutatorConfig>): void;
  requestUndo(): void;
  voteUndo(voteId: string, approve: boolean): void;
  createRoom(variant: RuleVariant): void;
  join(code: string, name: string): void;
  rejoin(code: string, token: string): void;
  leave(): void;
  toggleReady(ready: boolean): void;
  changeVariant(variant: RuleVariant): void;
  sendChat(text: string): void;
  playTile(tileId: string, end: End, velocity?: number): void;
  drawTile(): void;
  passTurn(): void;
  nextHand(): void;
  mixTiles(): void;
  pickTile(slotId: string): void;
}

function errorWithTimeout(message: string): Pick<TableState, 'error' | 'lastGameErrorAt'> {
  return { error: message, lastGameErrorAt: Date.now() };
}

export const useTableStore = create<TableState>()((set, get) => ({
  socket: null,
  connected: false,
  identity: { name: '' },
  room: null,
  roomCode: null,
  playerId: null,
  sessionToken: null,
  chat: [],
  view: null,
  selectedTileId: null,
  selectedEnd: 'left',
  showChat: false,
  error: null,
  lastGameErrorAt: 0,
  lastPlayVelocity: 0,
  lastPlacement: null,

  setSocket: (socket) => set({ socket }),
  setConnected: (connected) => set({ connected }),
  setIdentityName: (name) => set({ identity: { name: name.slice(0, 24) } }),
  setRoomCode: (roomCode) => set({ roomCode }),
  setRoom: (room) => set({ room }),

  handleJoined: (meta, playerId, sessionToken) =>
    set({
      room: meta,
      roomCode: meta.code,
      playerId,
      sessionToken,
      chat: [],
      view: null,
      selectedTileId: null,
      error: null,
    }),

  pushChat: (entry) => set((s) => ({ chat: [...s.chat.slice(-99), entry] })),

  applyGameView: (view) =>
    set((s) => ({
      view,
      // A new table state invalidates any pending tile selection.
      selectedTileId: view.currentPlayer === s.playerId ? s.selectedTileId : null,
    })),

  selectTile: (selectedTileId) => set({ selectedTileId }),
  chooseEnd: (selectedEnd) => set({ selectedEnd }),
  toggleChat: () => set((s) => ({ showChat: !s.showChat })),
  setError: (error) => set(error ? errorWithTimeout(error) : { error: null, lastGameErrorAt: 0 }),
  recordPlacement: (lastPlacement) => set({ lastPlacement }),
  reset: () =>
    set({
      room: null,
      roomCode: null,
      playerId: null,
      sessionToken: null,
      chat: [],
      view: null,
      selectedTileId: null,
      error: null,
    }),

  changeMutators: (mutators) => {
    get().socket?.emit('room:mutators', { mutators });
  },
  requestUndo: () => {
    get().socket?.emit('game:undo-request');
  },
  voteUndo: (voteId, approve) => {
    get().socket?.emit('game:undo-vote', { voteId, approve });
  },
  createRoom: (variant) => {
    get().socket?.emit('room:create', {
      variant,
      name: get().identity.name.trim(),
      profileId: ledgerProfileId(),
    });
  },
  join: (code, name) => {
    get().socket?.emit('room:join', { code, name: name.trim(), profileId: ledgerProfileId() });
  },
  rejoin: (code, token) => {
    get().socket?.emit('room:rejoin', { code, token });
  },
  leave: () => {
    get().socket?.emit('room:leave');
  },
  toggleReady: (ready) => {
    get().socket?.emit('room:ready', { ready });
  },
  changeVariant: (variant) => {
    get().socket?.emit('room:variant', { variant });
  },
  sendChat: (text) => {
    const trimmed = text.trim().slice(0, 500);
    if (!trimmed) return;
    get().socket?.emit('chat', { text: trimmed });
  },
  playTile: (tileId, end, velocity = 0) => {
    set({ selectedTileId: null, lastPlayVelocity: velocity });
    get().socket?.emit('game:play', {
      tileId,
      end,
      velocity: Math.min(8, Math.max(0, Number.isFinite(velocity) ? velocity : 0)),
    });
  },
  drawTile: () => {
    get().socket?.emit('game:draw');
  },
  passTurn: () => {
    get().socket?.emit('game:pass');
  },
  nextHand: () => {
    get().socket?.emit('game:next-hand');
  },
  mixTiles: () => {
    get().socket?.emit('game:mix');
  },
  pickTile: (slotId) => {
    get().socket?.emit('game:pick', { slotId });
  },
}));
