import seedrandom from 'seedrandom';
import type { Chain, End, GameState, PlayerState, RuleVariant, Tile } from './types.js';
import { VARIANT_RULES } from './types.js';

/** The standard double-six domino set: 28 tiles. */
export function createDoubleSixSet(): Tile[] {
  const tiles: Tile[] = [];
  for (let low = 0; low <= 6; low++) {
    for (let high = low; high <= 6; high++) {
      tiles.push({ id: `${low}-${high}`, low, high });
    }
  }
  return tiles;
}

/**
 * Fisher-Yates shuffle driven by a seeded PRNG so the exact same seed always
 * produces the exact same boneyard order (provably fair, reproducible).
 */
export function shuffleTiles(tiles: readonly Tile[], seed: string): Tile[] {
  const rng = seedrandom(seed);
  const out = [...tiles];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i] as Tile;
    const b = out[j] as Tile;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** Commit to the shuffled order before revealing it (hash-before-reveal). */
export function commitShuffle(order: readonly Tile[], nonce: string): string {
  const payload = order.map((t) => t.id).join(',') + '|' + nonce;
  return fnv1a(payload);
}

/** Simple deterministic 32-bit FNV-1a hash, used for shuffle commitments. */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Total pips on a tile (a double counts twice). */
export function tilePips(tile: Tile): number {
  return tile.low + tile.high;
}

/** Sum of pips for a set of tiles. */
export function handPips(hand: readonly Tile[]): number {
  return hand.reduce((sum, t) => sum + tilePips(t), 0);
}

export interface DealResult {
  readonly hands: readonly Tile[][];
  readonly boneyard: readonly Tile[];
  readonly chain: Chain;
  readonly seed: string;
}

/**
 * Deal a hand of dominoes.
 * `handSize` tiles go to each player; the rest form the boneyard.
 * The player holding the highest double (or highest tile) opens the chain.
 */
export function deal(
  players: readonly { id: string; name: string }[],
  seed: string,
  handSize = 6,
): DealResult {
  const deck = shuffleTiles(createDoubleSixSet(), seed);
  const hands: Tile[][] = players.map(() => []);
  for (let i = 0; i < handSize * players.length; i++) {
    const tile = deck[i];
    if (!tile) continue;
    hands[i % players.length]?.push(tile);
  }
  const boneyard = deck.slice(handSize * players.length);

  // Opening player: highest double, else highest total pips.
  let opener = 0;
  let bestRank = -1;
  hands.forEach((hand, idx) => {
    for (const tile of hand) {
      const rank = tile.low === tile.high ? 100 + tile.low : tilePips(tile);
      if (rank > bestRank) {
        bestRank = rank;
        opener = idx;
      }
    }
  });

  // Rotate so the opener sits first in the hands array.
  const rotated = hands.slice(opener).concat(hands.slice(0, opener));

  // Pick an opening tile: highest double in the opener's hand, else highest pips.
  const openingHand = rotated[0] ?? [];
  let opening: Tile | undefined;
  let openRank = -1;
  for (const tile of openingHand) {
    const rank = tile.low === tile.high ? 100 + tile.low : tilePips(tile);
    if (rank > openRank) {
      openRank = rank;
      opening = tile;
    }
  }

  // If the opener has no tile at all, pick the highest tile from the deck.
  if (!opening && openingHand.length === 0 && deck.length > 0) {
    opening = deck[0]!;
    openRank = opening.low === opening.high ? 100 + opening.low : tilePips(opening);
  }

  // Build the chain from the opening tile (single tile, both ends = tile value).
  const chain: Chain = {
    tiles: opening ? [opening] : [],
    leftEnd: opening ? opening.low : 0,
    rightEnd: opening ? opening.high : 0,
  };

  // Remove the opening tile from the opener's hand. `rotated[0]` aliases the
  // opener's original hand array, so rebind through `rotated`, not `hands`.
  if (opening) {
    rotated[0] = (rotated[0] ?? []).filter((t) => t.id !== opening.id);
  }

  return { hands: rotated, boneyard, chain, seed };
}

/** A legal placement of one tile on one end of the chain. */
export interface LegalMove {
  readonly tile: Tile;
  readonly end: End;
}

/**
 * All legal placements for a hand given the current chain.
 * Respects the variant's double-crossing rule.
 */
export function legalMoves(
  hand: readonly Tile[],
  chain: Chain,
  variant: RuleVariant,
): LegalMove[] {
  const rules = VARIANT_RULES[variant];
  const moves: LegalMove[] = [];
  for (const tile of hand) {
    const isDouble = tile.low === tile.high;
    if (tile.low === chain.leftEnd || tile.high === chain.leftEnd) {
      moves.push({ tile, end: 'left' });
    }
    if (tile.low === chain.rightEnd || tile.high === chain.rightEnd) {
      moves.push({ tile, end: 'right' });
    }
    if (isDouble && rules.doublesCross) {
      if (tile.low === chain.rightEnd && !moves.some((m) => m.end === 'right')) {
        moves.push({ tile, end: 'right' });
      }
      if (tile.low === chain.leftEnd && !moves.some((m) => m.end === 'left')) {
        moves.push({ tile, end: 'left' });
      }
    }
  }
  return moves;
}

/** True when the player has at least one legal move. */
export function hasLegalMove(
  hand: readonly Tile[],
  chain: Chain,
  variant: RuleVariant,
): boolean {
  return legalMoves(hand, chain, variant).length > 0;
}

/**
 * Place a tile on one end of the chain, returning the new chain.
 * Throws when the move is illegal so the server can reject it authoritatively.
 */
export function playTile(
  chain: Chain,
  tile: Tile,
  end: End,
  variant: RuleVariant,
): Chain {
  const allowed = legalMoves([tile], chain, variant);
  if (!allowed.some((m) => m.end === end)) {
    throw new Error(
      `Illegal move: tile ${tile.id} cannot be placed on ${end} end ` +
        `(ends are ${chain.leftEnd}|${chain.rightEnd})`,
    );
  }
  if (end === 'left') {
    const newLeft = tile.low === chain.leftEnd ? tile.high : tile.low;
    return {
      tiles: [...chain.tiles, tile],
      leftEnd: newLeft,
      rightEnd: chain.rightEnd,
    };
  }
  const newRight = tile.high === chain.rightEnd ? tile.low : tile.high;
  return {
    tiles: [...chain.tiles, tile],
    leftEnd: chain.leftEnd,
    rightEnd: newRight,
  };
}

/** Draw one tile from the boneyard. Returns null when the boneyard is empty. */
export function drawFromBoneyard(boneyard: readonly Tile[]): Tile | null {
  return boneyard[0] ?? null;
}

/**
 * End-of-hand scoring.
 * Block/Draw: the player who goes out wins; pip scoring applies for the
 * pip-scoring variants (All Fives, Caribbean, Latin).
 */
export function scoreHand(
  players: readonly PlayerState[],
  winnerId: string,
  variant: RuleVariant,
): Record<string, number> {
  const rules = VARIANT_RULES[variant];
  const deltas: Record<string, number> = {};
  for (const p of players) deltas[p.id] = 0;
  const winner = players.find((p) => p.id === winnerId);
  if (!winner) return deltas;

  if (!rules.pipScoring) {
    deltas[winnerId] = 1;
    return deltas;
  }

  let loserTotal = 0;
  for (const p of players) {
    if (p.id === winnerId) continue;
    loserTotal += handPips(p.hand);
  }
  deltas[winnerId] = Math.round(loserTotal * rules.scoreMultiplier);
  return deltas;
}

/** Build the initial immutable game state. */
export function createInitialState(
  players: readonly { id: string; name: string }[],
  variant: RuleVariant,
  seed: string,
  handSize = 6,
): GameState {
  const dealt = deal(players, seed, handSize);
  const playerStates: PlayerState[] = dealt.hands.map((hand, i) => ({
    id: players[i]?.id ?? '',
    name: players[i]?.name ?? `Player ${i + 1}`,
    hand,
    score: 0,
    seated: true,
  }));
  return {
    players: playerStates,
    chain: dealt.chain,
    boneyard: dealt.boneyard,
    phase: 'awaiting-play',
    currentPlayer: playerStates[0]?.id ?? '',
    turn: 0,
    variant,
    winner: null,
    lastMove: null,
    seed,
  };
}

