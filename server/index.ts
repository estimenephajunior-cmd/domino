import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { createRoomStore, createMemoryStore, type RoomStore } from './rooms.js';
import { attachSignaling, roomMeta } from './signaling.js';
import { attachGameHandlers, disposeGames } from './game.js';
import { ledgerSnapshot } from './ledger.js';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';

type HttpServer = ReturnType<typeof createServer>;

/**
 * Build a fully wired app + HTTP + Socket.IO stack. A store may be injected
 * (integration tests use an isolated in-memory store); production uses the
 * persistent file-backed store. Listening is intentionally NOT started here.
 */
export function createServerInstance(
  store: RoomStore = createRoomStore(),
  options: { readonly mixDurationMs?: number } = {},
): {
  app: express.Express;
  httpServer: HttpServer;
  io: Server;
  store: RoomStore;
} {
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '256kb' }));

  // Basic hardening: cap abusive clients without breaking normal play.
  const apiLimiter = rateLimit({
    windowMs: 60_000,
    limit: 240,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });
  app.use('/api', apiLimiter);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime(), rooms: store.size() });
  });

  const roomSchema = z.object({
    code: z.string().min(3).max(32),
    name: z.string().trim().min(3).max(24),
  });

  app.get('/api/rooms/:code', (req, res) => {
    const parsed = roomSchema.partial().safeParse({ code: req.params.code });
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid room code' });
      return;
    }
    const room = store.get(req.params.code);
    if (!room) {
      res.status(404).json({ error: 'room not found' });
      return;
    }
    res.json(roomMeta(room));
  });

  /** Manifest of the mod marketplace: statically served plugin descriptors. */
  app.get('/api/plugins', (_req, res) => {
    res.json({ plugins: store.listPlugins() });
  });

  const profileSchema = z.string().regex(/^guest-[A-Za-z0-9_-]{16,64}$/);
  app.get('/api/ledger/:profileId', (req, res) => {
    const parsed = profileSchema.safeParse(req.params.profileId);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid profile id' });
      return;
    }
    res.json(ledgerSnapshot(store, parsed.data));
  });


  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
    pingInterval: 25_000,
    pingTimeout: 20_000,
    transports: ['websocket', 'polling'],
  });

  attachSignaling(io, store);
  attachGameHandlers(io, store, options);
  httpServer.once('close', () => {
    disposeGames(store);
  });

  return { app, httpServer, io, store };
}

const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

// Under test, bootstrap against an isolated in-memory store so the dev/prod
// sqlite file is never touched by the suite.
const { app, httpServer, io, store } = isTestEnv
  ? createServerInstance(createMemoryStore())
  : createServerInstance();

if (!isTestEnv) {
  httpServer.listen(PORT, HOST, () => {
    console.log(`[domino] signaling server listening on http://${HOST}:${PORT}`);
  });

  async function shutdown(signal: string): Promise<void> {
    console.log(`[domino] ${signal} received, shutting down`);
    io.close();
    httpServer.close(() => process.exit(0));
    // Force-exit if sockets keep the loop alive.
    setTimeout(() => process.exit(0), 3000).unref();
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

export { app, httpServer, io, store, nanoid };
