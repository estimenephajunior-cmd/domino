import { randomBytes } from 'node:crypto';
import { nanoid } from 'nanoid';
import Database from 'better-sqlite3';
import { VARIANT_RULES, type RuleVariant } from '../shared/types.js';

export interface RoomPlayer {
  readonly id: string;
  readonly name: string;
  readonly socketId: string | null;
  readonly ready: boolean;
  readonly seat: number;
}

export interface Room {
  readonly code: string;
  readonly createdAt: number;
  /** Mutable: the host may change the variant before the hand starts. */
  variant: RuleVariant;
  readonly players: Map<string, RoomPlayer>;
  readonly chat: { playerId: string; name: string; text: string; at: number }[];
  readonly maxPlayers: number;
}

export interface PluginDescriptor {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly author: string;
  readonly lines: number;
}

export interface RoomStore {
  create(variant: RuleVariant): Room;
  get(code: string): Room | undefined;
  delete(code: string): boolean;
  size(): number;
  listPlugins(): PluginDescriptor[];
  /** Persisted rows survive restarts (cross-session Grudge Lists). */
  readonly db: Database.Database;
}

/** Room codes look like `domino-x8k2p` and are URL-safe. */
export function generateRoomCode(): string {
  return `domino-${nanoid(6).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`;
}

const DB_PATH = process.env.DOMINO_DB ?? 'domino.sqlite';

function openDatabase(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS matches (
      id          TEXT PRIMARY KEY,
      room_code  TEXT NOT NULL,
      variant     TEXT NOT NULL,
      played_at   INTEGER NOT NULL,
      payload     TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS grudges (
      holder_id   TEXT NOT NULL,
      target_id   TEXT NOT NULL,
      points      INTEGER NOT NULL DEFAULT 0,
      held_since  INTEGER NOT NULL,
      PRIMARY KEY (holder_id, target_id)
    );
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint    TEXT PRIMARY KEY,
      holder_id   TEXT NOT NULL,
      p256dh      TEXT NOT NULL,
      auth        TEXT NOT NULL
    );
  `);
  return db;
}

const DEMO_PLUGINS: PluginDescriptor[] = [
  {
    id: 'chaos-mutator',
    name: 'Chaos Mutator',
    description: 'Randomly rotates one tile in the boneyard each round.',
    author: 'domino-engine',
    lines: 12,
  },
  {
    id: 'socratic-dealer',
    name: 'Socratic Dealer',
    description: 'Reveals the first tile to every player as a "guess my rule" prompt.',
    author: 'domino-engine',
    lines: 18,
  },
];

export function createRoomStore(): RoomStore {
  const db = openDatabase();
  const rooms = new Map<string, Room>();

  return {
    db,
    create(variant: RuleVariant): Room {
      const room: Room = {
        code: generateRoomCode(),
        createdAt: Date.now(),
        variant: VARIANT_RULES[variant] ? variant : 'block',
        players: new Map(),
        chat: [],
        maxPlayers: 4,
      };
      rooms.set(room.code, room);
      return room;
    },
    get(code: string): Room | undefined {
      return rooms.get(code);
    },
    delete(code: string): boolean {
      return rooms.delete(code);
    },
    size(): number {
      return rooms.size;
    },
    listPlugins(): PluginDescriptor[] {
      return DEMO_PLUGINS;
    },
  };
}

/** Utility for tests: an isolated in-memory store. */
export function createMemoryStore(): RoomStore {
  const db = new Database(':memory:');
  const rooms = new Map<string, Room>();
  return {
    db,
    create(variant: RuleVariant): Room {
      const room: Room = {
        code: generateRoomCode(),
        createdAt: Date.now(),
        variant,
        players: new Map(),
        chat: [],
        maxPlayers: 4,
      };
      rooms.set(room.code, room);
      return room;
    },
    get(code: string) {
      return rooms.get(code);
    },
    delete(code: string) {
      return rooms.delete(code);
    },
    size() {
      return rooms.size;
    },
    listPlugins() {
      return DEMO_PLUGINS;
    },
  };
}

/** Random per-match nonce used to salt shuffle commitments. */
export function makeNonce(): string {
  return randomBytes(16).toString('hex');
}
