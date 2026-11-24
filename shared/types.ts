import type { MutatorConfig, PhaseFiveView } from './phaseFive.js';
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
export type End = 'left' | 'right' | 'top' | 'bottom';
export const ENDS: readonly End[] = ['left', 'right', 'top', 'bottom'];

/** Supported rule variants. Each has its own scoring / draw semantics. */
export type RuleVariant = 'block' | 'draw' | 'all-fives' | 'caribbean' | 'latin';

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
  /** Highest pip value in the set used by this variant (6 → 28 tiles, 9 → 55). */
  readonly setSize: 6 | 9;
  /** Doubles are playable across the chain in this variant. */
  readonly doublesCross: boolean;
  /** Players may draw from the boneyard when they cannot move. */
  readonly allowDraw: boolean;
  /** Score = sum of all pips exposed at the end of the hand. */
  readonly pipScoring: boolean;
  /** Multiplier applied to the pip total at hand end. */
  readonly scoreMultiplier: number;
  /** Seats alternate teams (0,2 vs 1,3); scoring settles per team. */
  readonly partnership: boolean;
}

export { VARIANT_RULES } from './rules.js';

/** Team id for a seat in partnership variants: seats 0,2 vs 1,3. */
export function teamOfSeat(seatIndex: number): 0 | 1 {
  return seatIndex % 2 === 0 ? 0 : 1;
}

/**
 * A tile as it lies on the board. `low`/`high` stay normalized (low <= high);
 * `left`/`right` are the physical halves facing the chain's left and right ends,
 * so the board can be drawn without re-deriving orientation.
 */
export interface PlacedTile extends Tile {
  readonly left: number;
  readonly right: number;
}

/** A domino chain: tiles plus the two open ends. */
export interface Chain {
  /** Tiles in board order, from the left open end to the right open end. */
  readonly tiles: readonly PlacedTile[];
  readonly leftEnd: number;
  readonly rightEnd: number;
  /**
   * The first double played cross-wise in doubles-cross variants (the
   * "spinner"). Null in linear-only variants.
   */
  readonly spinner: Tile | null;
  /** Additional arms, ordered from spinner outwards. */
  readonly branches?: {
    readonly top: readonly PlacedTile[];
    readonly bottom: readonly PlacedTile[];
  };
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
  | 'mixing'
  | 'picking'
  | 'awaiting-play'
  | 'awaiting-draw'
  | 'hand-complete'
  | 'game-over';

export interface DealSlot {
  readonly id: string;
  readonly tile: Tile;
  readonly claimedBy: string | null;
}

export interface PublicDealSlot {
  readonly id: string;
  readonly claimed: boolean;
}

export type PublicGameAction =
  | {
      readonly type: 'play';
      readonly playerId: string;
      readonly tile: Tile;
      readonly end: End;
      readonly turn: number;
    }
  | {
      readonly type: 'pass';
      readonly playerId: string;
      readonly openPips: readonly number[];
      readonly turn: number;
    }
  | {
      readonly type: 'draw';
      readonly playerId: string;
      readonly count: number;
      readonly turn: number;
    };

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
  readonly dealerId: string;
  readonly currentPickerId: string | null;
  readonly mixingEndsAt: number | null;
  readonly dealSlots: readonly DealSlot[];
  readonly preferredStarterId: string | null;
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
  readonly mutators?: MutatorConfig;
  readonly code: string;
  readonly createdAt: number;
  readonly playerCount: number;
  readonly maxPlayers: number;
  readonly variant: RuleVariant;
  /** Seated players in seat order, for the lobby roster. */
  readonly seats: readonly RoomSeat[];
}

/** One occupied seat, as broadcast to every client in the room. */
export interface RoomSeat {
  readonly voiceEnabled?: boolean;
  readonly id: string;
  readonly name: string;
  readonly seat: number;
  readonly ready: boolean;
  readonly connected?: boolean;
}

/** A tile play request from the player whose turn it is. */
export interface PlayRequest {
  readonly velocity?: number;
  readonly tileId: string;
  readonly end: End;
}

/**
 * One player's sanitized game view: full public table state, but every
 * opponent rack is a count. The recipient's own hand travels separately.
 */
export interface PlayerView {
  readonly phaseFive?: PhaseFiveView;
  readonly players: readonly {
    readonly id: string;
    readonly name: string;
    readonly handCount: number;
    readonly score: number;
    readonly seated: boolean;
  }[];
  readonly chain: GameState['chain'];
  readonly boneyardCount: number;
  readonly phase: GameState['phase'];
  readonly currentPlayer: string;
  readonly turn: number;
  readonly variant: RuleVariant;
  readonly winner: string | null;
  readonly lastMove: GameState['lastMove'];
  /** Empty while the hand is live. */
  readonly seed: string;
  readonly fairness?: { readonly commitment: string; readonly reveal: ShuffleProof | null };
  /** Only the requesting player's own hand; empty for everyone else. */
  readonly yourHand: readonly Tile[];
  readonly handNumber: number;
  readonly blocked: boolean;
  readonly drawing: boolean;
  readonly dealerId: string;
  readonly currentPickerId: string | null;
  readonly mixingEndsAt: number | null;
  readonly dealSlots: readonly PublicDealSlot[];
  readonly picksByPlayer: Readonly<Record<string, number>>;
  /** Public-only action history used by the local Shadow Predictor. */
  readonly publicActions?: readonly PublicGameAction[];
}

export type ClientToServer =
  | { readonly type: 'voice:state'; readonly enabled: boolean }
  | {
      readonly type: 'room:create';
      readonly variant?: RuleVariant;
      readonly name?: string;
      readonly profileId?: string;
    }
  | { readonly type: 'room:join'; readonly code: string; readonly name: string; readonly profileId?: string }
  | { readonly type: 'room:mutators'; readonly mutators: Partial<MutatorConfig> }
  | { readonly type: 'game:undo-request' }
  | { readonly type: 'game:undo-vote'; readonly voteId: string; readonly approve: boolean }
  | { readonly type: 'room:leave' }
  | { readonly type: 'room:ready'; readonly ready: boolean }
  | { readonly type: 'room:rejoin'; readonly code: string; readonly token: string }
  | { readonly type: 'room:variant'; readonly variant: RuleVariant }
  | { readonly type: 'chat'; readonly text: string }
  | { readonly type: 'game:ready' }
  | { readonly type: 'game:mix' }
  | { readonly type: 'game:pick'; readonly slotId: string }
  | ({ readonly type: 'game:play' } & PlayRequest)
  | { readonly type: 'game:draw' }
  | { readonly type: 'game:pass' }
  | { readonly type: 'game:next-hand' };

export type ServerToClient =
  | {
      readonly type: 'game:placement';
      readonly tileId: string;
      readonly playerId: string;
      readonly velocity: number;
    }
  | { readonly type: 'room:created'; readonly code: string }
  | {
      readonly type: 'room:joined';
      readonly meta: RoomMeta;
      readonly playerId: string;
      readonly sessionToken: string;
    }
  | {
      readonly type: 'room:rejoined';
      readonly meta: RoomMeta;
      readonly playerId: string;
      readonly sessionToken: string;
    }
  | { readonly type: 'room:left' }
  | { readonly type: 'room:state'; readonly meta: RoomMeta }
  | { readonly type: 'room:error'; readonly reason: string }
  | {
      readonly type: 'chat';
      readonly playerId: string;
      readonly name: string;
      readonly text: string;
      readonly at: number;
    }
  | { readonly type: 'room:full' }
  | { readonly type: 'game:state'; readonly playerId: string; readonly view: PlayerView }
  | { readonly type: 'game:error'; readonly reason: string }
  | { readonly type: 'game:ended'; readonly reason: string }
  | { readonly type: 'game:commitment'; readonly handNumber: number; readonly commitment: string };
