import { DEFAULT_MUTATORS } from '../shared/mutators.js';
import type { MutatorConfig } from '../shared/phaseFive.js';
import { randomBytes } from 'node:crypto';
import { customAlphabet } from 'nanoid';
import Database from 'better-sqlite3';
import { VARIANT_RULES, type RuleVariant } from '../shared/types.js';

export interface RoomPlayer {
  readonly voiceEnabled?: boolean;
  readonly id: string;
  readonly name: string;
  readonly socketId: string | null;
  readonly ready: boolean;
  readonly seat: number;
  /** Secret reconnect token (stored client-side in sessionStorage). */
  readonly sessionToken: string;
  /** Stable anonymous browser identity used only by the Karmic Ledger. */
  readonly profileId?: string;
}

export interface Room {
  readonly code: string;
  readonly createdAt: number;
  /** Mutable: the host may change the variant before the hand starts. */
  variant: RuleVariant;
  mutators: MutatorConfig;
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
  /** Persisted rows survive restarts. */
  readonly db: Database.Database;
}

const shortCode = customAlphabet('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 6);

/** Short, readable room code with ambiguous characters removed. */
export function generateRoomCode(): string {
  return shortCode();
}

const DB_PATH = process.env.DOMINO_DB ?? 'domino.sqlite';

function applySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      last_seen   INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS matches (
      id          TEXT PRIMARY KEY,
      room_code  TEXT NOT NULL,
      variant     TEXT NOT NULL,
      played_at   INTEGER NOT NULL,
      payload     TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS match_players (
      match_id       TEXT NOT NULL,
      player_id      TEXT NOT NULL,
      name           TEXT NOT NULL,
      score          INTEGER NOT NULL,
      won            INTEGER NOT NULL,
      hand_count     INTEGER NOT NULL,
      draws           INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (match_id, player_id)
    );
    CREATE INDEX IF NOT EXISTS match_players_player ON match_players(player_id, match_id);
  `);
  const playerColumns = db.pragma('table_info(players)') as { name: string }[];
  if (!playerColumns.some((column) => column.name === 'last_seen'))
    db.exec('ALTER TABLE players ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0');
}

function openDatabase(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applySchema(db);
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
        mutators: { ...DEFAULT_MUTATORS },
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
  applySchema(db);
  const rooms = new Map<string, Room>();
  return {
    db,
    create(variant: RuleVariant): Room {
      const room: Room = {
        code: generateRoomCode(),
        createdAt: Date.now(),
        variant,
        mutators: { ...DEFAULT_MUTATORS },
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
