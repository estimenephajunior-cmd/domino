import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useTableStore } from '../state/tableStore';
import type { PlayerView, RoomMeta } from '../../shared/types';

interface JoinedPayload {
  meta: RoomMeta;
  playerId: string;
  sessionToken: string;
}

interface GameStatePayload {
  playerId: string;
  view: PlayerView;
}

/**
 * Where to reach the table server.
 *
 * By default the client talks to its own origin, so the Vite dev server
 * proxies `/socket.io` to the API and a production deployment can serve both
 * from one host. `VITE_SERVER_URL` overrides this for split deployments.
 */
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '/';

/** Key under which this tab's active seat is remembered. */
const SESSION_KEY = 'domino-session';

/** A tab's remembered seat: which room, which player, and the secret token. */
export interface StoredSession {
  readonly code: string;
  readonly playerId: string;
  readonly token: string;
}

/**
 * Remember the seat this tab holds, so a refresh or a dropped connection can
 * reclaim it instead of losing the hand.
 */
export function writeStoredSession(session: StoredSession): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Private-mode storage may throw; the token still lives in memory.
  }
}

/** Read the remembered seat for this tab, if any. */
export function readStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.code === 'string' &&
      typeof parsed.playerId === 'string' &&
      typeof parsed.token === 'string'
    ) {
      return { code: parsed.code, playerId: parsed.playerId, token: parsed.token };
    }
    return null;
  } catch {
    return null;
  }
}

/** Forget the remembered seat (the player left the table). */
export function clearStoredSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to do; the in-memory state is cleared regardless.
  }
}

/**
 * Room code carried in the URL (`/table/<code>`), so an invite link lands the
 * guest directly in the right room.
 */
export function roomCodeFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const match = /\/table\/([A-Za-z0-9_-]{3,64})/.exec(window.location.pathname);
  return match?.[1] ?? null;
}

/** Retain the original hand commitment so a later reveal cannot replace it. */
export function rememberCommitment(code: string, handNumber: number, commitment: string): boolean {
  const key = `domino-fairness:${code}:${handNumber}`;
  try {
    const previous = sessionStorage.getItem(key);
    if (previous && previous !== commitment) return false;
    sessionStorage.setItem(key, commitment);
  } catch {
    // Session storage can be unavailable; the current view still carries the proof.
  }
  return true;
}

/** A new match in the same room restarts hand numbering. */
export function clearCommitments(code: string): void {
  try {
    const prefix = `domino-fairness:${code}:`;
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable in private browsing.
  }
}

/**
 * Socket lifecycle bridge: connects once, routes every server event into the
 * Zustand store, persists the session token for reconnects.
 * Mounted once by App; never renders markup.
 */
export function SocketBridge() {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;
    const store = useTableStore.getState();
    store.setSocket(socket);

    socket.on('connect', () => {
      useTableStore.getState().setConnected(true);

      // Prefer the seat this tab already holds: it survives both a dropped
      // transport and a full page refresh, so the player keeps their hand.
      const stored = readStoredSession();
      if (stored) {
        socket.emit('room:rejoin', { code: stored.code, token: stored.token });
        return;
      }

      // Invite links intentionally stop at the alias form. A guest joins only
      // after choosing a valid display name and pressing Join.
    });

    socket.on('disconnect', () => {
      useTableStore.getState().setConnected(false);
    });

    socket.on('room:created', ({ code }: { code: string }) => {
      useTableStore.getState().setRoomCode(code);
    });

    socket.on('room:joined', (payload: JoinedPayload) => {
      writeStoredSession({
        code: payload.meta.code,
        playerId: payload.playerId,
        token: payload.sessionToken,
      });
      useTableStore.getState().handleJoined(payload.meta, payload.playerId, payload.sessionToken);
    });

    socket.on('room:rejoined', (payload: JoinedPayload) => {
      writeStoredSession({
        code: payload.meta.code,
        playerId: payload.playerId,
        token: payload.sessionToken,
      });
      const current = useTableStore.getState();
      // Keep the mounted table and its microphone during transport recovery.
      // A full page refresh still starts with no snapshot and follows normal join setup.
      if (
        current.playerId === payload.playerId &&
        current.roomCode === payload.meta.code &&
        current.view
      )
        current.setRoom(payload.meta);
      else current.handleJoined(payload.meta, payload.playerId, payload.sessionToken);
    });

    socket.on('room:state', (meta: RoomMeta) => {
      useTableStore.getState().setRoom(meta);
    });

    socket.on('room:left', () => {
      const code = useTableStore.getState().roomCode;
      if (code) clearCommitments(code);
      clearStoredSession();
      window.history.replaceState(null, '', '/');
      useTableStore.getState().reset();
    });

    socket.on('game:ended', () => {
      const current = useTableStore.getState();
      if (current.roomCode) clearCommitments(current.roomCode);
      if (current.room && current.playerId && current.sessionToken) {
        current.handleJoined(current.room, current.playerId, current.sessionToken);
      }
    });

    socket.on('room:error', ({ reason }: { reason: string }) => {
      if (reason === 'room not found' || reason === 'invalid session token') {
        clearStoredSession();
        useTableStore.getState().reset();
        window.history.replaceState(null, '', '/');
      }
      useTableStore.getState().setError(typeof reason === 'string' ? reason : 'Room error');
    });

    socket.on('room:full', () => {
      useTableStore.getState().setError('Room is full (4 seats).');
    });

    socket.on('chat', (entry: { playerId: string; name: string; text: string; at: number }) => {
      useTableStore.getState().pushChat(entry);
    });

    socket.on(
      'game:commitment',
      ({ handNumber, commitment }: { handNumber: number; commitment: string }) => {
        const current = useTableStore.getState();
        if (current.roomCode && !rememberCommitment(current.roomCode, handNumber, commitment)) {
          current.setError('The shuffle commitment changed. Fairness verification failed.');
        }
      },
    );

    socket.on('game:state', (payload: GameStatePayload) => {
      if (payload.playerId !== useTableStore.getState().playerId) return;
      const current = useTableStore.getState();
      if (
        current.roomCode &&
        payload.view.fairness &&
        !rememberCommitment(
          current.roomCode,
          payload.view.handNumber,
          payload.view.fairness.commitment,
        )
      ) {
        current.setError('The shuffle commitment changed. Fairness verification failed.');
        return;
      }
      current.applyGameView(payload.view);
    });

    socket.on(
      'game:placement',
      (placement: { tileId: string; playerId: string; velocity: number }) => {
        useTableStore.getState().recordPlacement(placement);
      },
    );

    socket.on('game:error', ({ reason }: { reason: string }) => {
      useTableStore.getState().setError(typeof reason === 'string' ? reason : 'Illegal move');
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      useTableStore.getState().setSocket(null);
    };
  }, []);

  return null;
}
