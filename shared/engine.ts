import { allBoardTiles, openEnds, placeBranch } from './graph.js';
import seedrandom from 'seedrandom';
import type { Chain, End, GameState, PlacedTile, PlayerState, RuleVariant, Tile } from './types.js';
import { VARIANT_RULES, teamOfSeat } from './types.js';

/** A complete domino set up to `max` (6 → 28 tiles, 9 → 55 tiles). */
export function createDominoSet(max: number): Tile[] {
  if (!Number.isInteger(max) || max < 0 || max > 9) throw new Error('Invalid domino set size');
  const tiles: Tile[] = [];
  for (let low = 0; low <= max; low++) {
    for (let high = low; high <= max; high++) {
      tiles.push({ id: `${low}-${high}`, low, high });
    }
  }
  return tiles;
}

/** The standard double-six domino set: 28 tiles. */
export function createDoubleSixSet(): Tile[] {
  return createDominoSet(6);
}

/** The double-nine domino set: 55 tiles (Caribbean / Cuban). */
export function createDoubleNineSet(): Tile[] {
  return createDominoSet(9);
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
  /** Player ids rotated alongside `hands`, so index 0 is the opening player. */
  readonly order: readonly string[];
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
  setSize: 6 | 9 = 6,
): DealResult {
  if (
    players.length < 1 ||
    players.length > 4 ||
    new Set(players.map((p) => p.id)).size !== players.length
  ) {
    throw new Error('Expected one to four distinct players');
  }
  const deck = shuffleTiles(createDominoSet(setSize), seed);
  if (!Number.isInteger(handSize) || handSize < 1 || handSize * players.length > deck.length) {
    throw new Error('Invalid hand size');
  }
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

  // Rotate so the opener sits first in the hands array. The id list rotates
  // with the hands so ownership is preserved: hands[i] still belongs to order[i].
  const rotated = hands.slice(opener).concat(hands.slice(0, opener));
  const order = players
    .slice(opener)
    .concat(players.slice(0, opener))
    .map((p) => p.id);

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
    tiles: opening ? [{ ...opening, left: opening.low, right: opening.high }] : [],
    leftEnd: opening ? opening.low : 0,
    rightEnd: opening ? opening.high : 0,
    spinner: null,
  };

  // Remove the opening tile from the opener's hand. `rotated[0]` aliases the
  // opener's original hand array, so rebind through `rotated`, not `hands`.
  if (opening) {
    rotated[0] = (rotated[0] ?? []).filter((t) => t.id !== opening.id);
  }

  return { hands: rotated, order, boneyard, chain, seed };
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
export function legalMoves(hand: readonly Tile[], chain: Chain, variant: RuleVariant): LegalMove[] {
  if (allBoardTiles(chain).length === 0 && chain.leftEnd === 0 && chain.rightEnd === 0)
    return hand.map((tile) => ({ tile, end: 'right' }));
  const moves: LegalMove[] = [];
  const targets = openEnds(chain).filter(
    (target) =>
      VARIANT_RULES[variant].doublesCross || target.end === 'left' || target.end === 'right',
  );
  for (const tile of hand) {
    for (const target of targets) {
      if (tile.low === target.pip || tile.high === target.pip)
        moves.push({ tile, end: target.end });
    }
  }
  return moves;
}

/** True when the player has at least one legal move. */
export function hasLegalMove(hand: readonly Tile[], chain: Chain, variant: RuleVariant): boolean {
  return legalMoves(hand, chain, variant).length > 0;
}

/**
 * Place a tile on one end of the chain, returning the new chain.
 * Throws when the move is illegal so the server can reject it authoritatively.
 */
export function playTile(chain: Chain, tile: Tile, end: End, variant: RuleVariant): Chain {
  const allowed = legalMoves([tile], chain, variant);
  if (!allowed.some((m) => m.end === end)) {
    throw new Error(
      `Illegal move: tile ${tile.id} cannot be placed on ${end} end ` +
        `(ends are ${chain.leftEnd}|${chain.rightEnd})`,
    );
  }
  if (allBoardTiles(chain).some((placed) => placed.id === tile.id)) {
    throw new Error('Tile is already on the board');
  }
  if (
    chain.tiles.length === 0 &&
    chain.leftEnd === 0 &&
    chain.rightEnd === 0 &&
    !(chain.branches?.top.length || chain.branches?.bottom.length)
  ) {
    const placed: PlacedTile = { ...tile, left: tile.low, right: tile.high };
    return {
      tiles: [placed],
      leftEnd: tile.low,
      rightEnd: tile.high,
      spinner: VARIANT_RULES[variant].doublesCross && tile.low === tile.high ? tile : null,
    };
  }
  if (end === 'top' || end === 'bottom') return placeBranch(chain, tile, end);
  const rules = VARIANT_RULES[variant];
  // First double placed in a doubles-cross variant becomes the spinner.
  const spinner = chain.spinner ?? (rules.doublesCross && tile.low === tile.high ? tile : null);
  if (end === 'left') {
    // The matching half touches the chain, so it faces RIGHT on the board;
    // the exposed half faces LEFT and becomes the new open end.
    const matchesLow = tile.low === chain.leftEnd;
    const right = matchesLow ? tile.low : tile.high;
    const left = matchesLow ? tile.high : tile.low;
    const placed: PlacedTile = { ...tile, left, right };
    return {
      ...chain,
      tiles: [placed, ...chain.tiles],
      leftEnd: left,
      rightEnd: chain.rightEnd,
      spinner,
    };
  }
  // Mirrored for the right end: the matching half faces LEFT.
  const matchesHigh = tile.high === chain.rightEnd;
  const left = matchesHigh ? tile.high : tile.low;
  const right = matchesHigh ? tile.low : tile.high;
  const placed: PlacedTile = { ...tile, left, right };
  return {
    ...chain,
    tiles: [...chain.tiles, placed],
    leftEnd: chain.leftEnd,
    rightEnd: right,
    spinner,
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
  const winnerIndex = players.findIndex((p) => p.id === winnerId);
  const winner = players[winnerIndex];
  if (winnerIndex === -1 || !winner) return deltas;

  // Partnership variants settle per team (seats 0,2 vs 1,3): the winning
  // team collects the losing team's total, credited equally to both partners.
  const scoringSeats = rules.partnership
    ? players
        .map((p, i) => ({ p, i }))
        .filter(({ i }) => teamOfSeat(i) === teamOfSeat(winnerIndex))
        .map(({ p }) => p)
    : [winner];

  if (!rules.pipScoring) {
    for (const p of scoringSeats) deltas[p.id] = 1;
    return deltas;
  }

  const winningIds = new Set(scoringSeats.map((p) => p.id));
  let loserTotal = 0;
  for (const p of players) {
    if (winningIds.has(p.id)) continue;
    loserTotal += handPips(p.hand);
  }
  const total = loserTotal * rules.scoreMultiplier;
  const award = variant === 'all-fives' ? Math.round(total / 5) * 5 : Math.round(total);
  for (const p of scoringSeats) deltas[p.id] = award;
  return deltas;
}

/** Build the initial immutable game state. */
export function createInitialState(
  players: readonly { id: string; name: string }[],
  variant: RuleVariant,
  seed: string,
  _handSize = 6,
): GameState {
  const rules = VARIANT_RULES[variant];
  const deck = shuffleTiles(createDominoSet(rules.setSize), seed);
  if (
    players.length < 1 ||
    players.length > 4 ||
    new Set(players.map((player) => player.id)).size !== players.length ||
    !Number.isInteger(_handSize) ||
    _handSize < 1 ||
    _handSize * players.length > deck.length
  )
    throw new Error('Invalid physical deal');
  const playerStates: PlayerState[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    hand: [],
    score: 0,
    seated: true,
  }));
  return {
    players: playerStates,
    chain: { tiles: [], leftEnd: 0, rightEnd: 0, spinner: null },
    boneyard: [],
    phase: 'mixing',
    currentPlayer: players[0]?.id ?? '',
    turn: 0,
    variant,
    winner: null,
    lastMove: null,
    seed,
    dealerId: players[0]?.id ?? '',
    currentPickerId: null,
    mixingEndsAt: null,
    dealSlots: deck.map((tile, index) => ({ id: `slot-${index}`, tile, claimedBy: null })),
    preferredStarterId: null,
  };
}

/** Holder of the highest double, falling back to the highest-pip tile. */
export function openingPlayer(players: readonly PlayerState[]): string {
  let owner = players[0]?.id ?? '';
  let best = -1;
  for (const player of players) {
    for (const tile of player.hand) {
      const rank = tile.low === tile.high ? 100 + tile.low : tilePips(tile);
      if (rank > best) {
        best = rank;
        owner = player.id;
      }
    }
  }
  return owner;
}
