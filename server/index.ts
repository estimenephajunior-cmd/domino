import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { createRoomStore, type RoomStore } from './rooms.js';
import { attachSignaling, roomMeta } from './signaling.js';
import { VAPID_KEYS, sendPushToAll } from './push.js';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';

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

const store: RoomStore = createRoomStore();

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), rooms: store.size() });
});

const roomSchema = z.object({
  code: z.string().min(3).max(32),
  name: z.string().min(1).max(24).default('Player'),
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

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
  pingInterval: 25_000,
  pingTimeout: 20_000,
  transports: ['websocket', 'polling'],
});

attachSignaling(io, store);

httpServer.listen(PORT, HOST, () => {
  console.log(`[domino] signaling server listening on http://${HOST}:${PORT}`);
  if (!VAPID_KEYS.publicKey) {
    console.log('[domino] web-push disabled: run `npm run push:generate` to create VAPID keys');
  }
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[domino] ${signal} received, shutting down`);
  await sendPushToAll(store);
  io.close();
  httpServer.close(() => process.exit(0));
  // Force-exit if sockets keep the loop alive.
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

export { app, httpServer, io, store, nanoid };
