/**
 * Shared domain types for the Domino Engine.
 * Imported by both the browser client (Vite) and the Node signaling server.
 */

/** A domino tile. `high` is always >= `low`. 0-6 doubles, 0-6 x 0-6 set. */
export interface Tile {
  readonly id: string;
  readonly low: number;
  readonly high: number;
}

/** Which end of the chain a tile was played on. */
export type End = 'left' | 'right';

/** Supported rule variants. Each has its own scoring / draw semantics. */
export type RuleVariant =
  | 'block'
  | 'draw'
  | 'all-fives'
  | 'caribbean'
  | 'latin';

export const RULE_VARIANTS: readonly RuleVariant[] = [
  'block',
  'draw',
  'all-fives',
  'caribbean',
  'latin',
] as const;

export interface VariantRules {
  readonly id: RuleVariant;
  readonly label: string;
  /** Doubles are playable across the chain in this variant. */
  readonly doublesCross: boolean;
  /** Players may draw from the boneyard when they cannot move. */
  readonly allowDraw: boolean;
  /** Score = sum of all pips exposed at the end of the hand. */
  readonly pipScoring: boolean;
  /** Multiplier applied to the pip total at hand end. */
  readonly scoreMultiplier: number;
  /** A double that cannot be legally placed ends the hand immediately. */
  readonly blockedDoubleEndsHand: boolean;
}

export const VARIANT_RULES: Record<RuleVariant, VariantRules> = {
  block: {
    id: 'block',
    label: 'Block',
    doublesCross: false,
    allowDraw: false,
    pipScoring: false,
    scoreMultiplier: 1,
    blockedDoubleEndsHand: true,
  },
  draw: {
    id: 'draw',
    label: 'Draw',
    doublesCross: false,
    allowDraw: true,
    pipScoring: false,
    scoreMultiplier: 1,
    blockedDoubleEndsHand: true,
  },
  'all-fives': {
    id: 'all-fives',
    label: 'All Fives (Muggins)',
    doublesCross: true,
    allowDraw: true,
    pipScoring: true,
    scoreMultiplier: 1,
    blockedDoubleEndsHand: false,
  },
  caribbean: {
    id: 'caribbean',
    label: 'Caribbean',
    doublesCross: true,
    allowDraw: true,
    pipScoring: true,
    scoreMultiplier: 1,
    blockedDoubleEndsHand: false,
  },
  latin: {
    id: 'latin',
    label: 'Latin',
    doublesCross: true,
    allowDraw: true,
    pipScoring: true,
    scoreMultiplier: 1,
    blockedDoubleEndsHand: false,
  },
};

/** A domino chain: tiles plus the two open ends. */
export interface Chain {
  readonly tiles: readonly Tile[];
  readonly leftEnd: number;
  readonly rightEnd: number;
}

export interface PlayerState {
  readonly id: string;
  readonly name: string;
  readonly hand: readonly Tile[];
  readonly score: number;
  readonly seated: boolean;
}

export type Phase =
  | 'dealing'
  | 'awaiting-play'
  | 'awaiting-draw'
  | 'hand-complete'
  | 'game-over';

export interface GameState {
  readonly players: readonly PlayerState[];
  readonly chain: Chain;
  readonly boneyard: readonly Tile[];
  readonly phase: Phase;
  readonly currentPlayer: string;
  readonly turn: number;
  readonly variant: RuleVariant;
  /** Set when a player is blocked; drives the "Domino!" callout + confetti. */
  readonly winner: string | null;
  readonly lastMove: {
    readonly playerId: string;
    readonly tile: Tile;
    readonly end: End;
  } | null;
  /** Deterministic seed used to prove the shuffle was fair. */
  readonly seed: string;
}

/** Proof-of-fairness payload exposed to players before the deal. */
export interface ShuffleProof {
  readonly seed: string;
  readonly serverNonce: string;
  readonly commitment: string;
  readonly revealedOrder: readonly string[];
}

/* ------------------------------ Networking ------------------------------ */

export interface RoomMeta {
  readonly code: string;
  readonly createdAt: number;
  readonly playerCount: number;
  readonly maxPlayers: number;
  readonly variant: RuleVariant;
}

export type ClientToServer =
  | { readonly type: 'room:create'; readonly variant: RuleVariant }
  | { readonly type: 'room:join'; readonly code: string }
  | { readonly type: 'room:leave' }
  | { readonly type: 'chat'; readonly text: string }
  | { readonly type: 'push:subscribe'; readonly subscription: unknown };

export type ServerToClient =
  | { readonly type: 'room:created'; readonly code: string }
  | { readonly type: 'room:joined'; readonly meta: RoomMeta }
  | { readonly type: 'room:left' }
  | { readonly type: 'room:error'; readonly reason: string }
  | { readonly type: 'chat'; readonly from: string; readonly text: string }
  | { readonly type: 'room:full' };

/* ------------------------------- Analytics ------------------------------ */

/** Entry in the client-side Karmic Ledger (persisted in IndexedDB). */
export interface LedgerEntry {
  readonly id?: number;
  readonly at: number;
  readonly opponent: string;
  readonly variant: RuleVariant;
  readonly won: boolean;
  readonly betrayalIndex: number;
  readonly scoreDelta: number;
}

/** Web Push subscription payload stored server-side per player. */
export interface PushSubscriptionRecord {
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
}
