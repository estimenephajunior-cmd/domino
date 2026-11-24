import { createDominoSet, legalMoves, playTile, tilePips } from './engine.js';
import { allBoardTiles, openEnds } from './graph.js';
import { VARIANT_RULES, type End, type PlayerView, type Tile } from './types.js';

export interface OpponentEstimate {
  readonly playerId: string;
  readonly name: string;
  readonly handCount: number;
  readonly excludedPips: readonly number[];
  readonly drawsAfterPass: number;
  readonly pipProbabilities: Readonly<Record<number, number>>;
}

export interface PipHeat {
  readonly pip: number;
  /** Chance that at least one opponent can answer this pip. */
  readonly probability: number;
}

export interface RankedShadowMove {
  readonly tile: Tile;
  readonly end: End;
  /** Higher is safer according to public information. */
  readonly score: number;
  readonly responseRisk: number;
  readonly pipRelief: number;
  readonly reason: string;
}

export interface ShadowAnalysis {
  readonly unknownTiles: readonly Tile[];
  readonly opponents: readonly OpponentEstimate[];
  readonly heatmap: readonly PipHeat[];
  readonly rankedMoves: readonly RankedShadowMove[];
  readonly safestMove: RankedShadowMove | null;
}

function probabilityAtLeastOne(singleTileShare: number, handCount: number): number {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, singleTileShare)), handCount);
}

function opponentEstimate(view: PlayerView, playerId: string, unknown: readonly Tile[]): OpponentEstimate {
  const player = view.players.find((entry) => entry.id === playerId)!;
  let lastPassIndex = -1;
  let excludedPips: readonly number[] = [];
  const actions = view.publicActions ?? [];
  actions.forEach((action, index) => {
    if (action.playerId === playerId && action.type === 'pass') {
      lastPassIndex = index;
      excludedPips = action.openPips;
    }
  });
  const drawsAfterPass = actions
    .slice(lastPassIndex + 1)
    .reduce(
      (sum, action) =>
        sum + (action.playerId === playerId && action.type === 'draw' ? action.count : 0),
      0,
    );
  const uncertainty = player.handCount === 0 ? 0 : Math.min(1, drawsAfterPass / player.handCount);
  const weights = unknown.map((tile) => {
    const conflicts = excludedPips.some((pip) => tile.low === pip || tile.high === pip);
    return conflicts ? 0.04 + uncertainty * 0.96 : 1;
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const pipProbabilities: Record<number, number> = {};
  for (let pip = 0; pip <= VARIANT_RULES[view.variant].setSize; pip += 1) {
    const matchingWeight = unknown.reduce(
      (sum, tile, index) =>
        sum + (tile.low === pip || tile.high === pip ? (weights[index] ?? 0) : 0),
      0,
    );
    pipProbabilities[pip] = probabilityAtLeastOne(matchingWeight / totalWeight, player.handCount);
  }
  return {
    playerId,
    name: player.name,
    handCount: player.handCount,
    excludedPips,
    drawsAfterPass,
    pipProbabilities,
  };
}

function combinedProbability(opponents: readonly OpponentEstimate[], pip: number): number {
  return 1 - opponents.reduce(
    (miss, opponent) => miss * (1 - (opponent.pipProbabilities[pip] ?? 0)),
    1,
  );
}

/** Analyze only information already visible to the requesting player. */
export function analyzeShadow(view: PlayerView, localPlayerId: string): ShadowAnalysis {
  const knownIds = new Set([
    ...view.yourHand.map((tile) => tile.id),
    ...allBoardTiles(view.chain).map((tile) => tile.id),
  ]);
  const unknownTiles = createDominoSet(VARIANT_RULES[view.variant].setSize).filter(
    (tile) => !knownIds.has(tile.id),
  );
  const opponents = view.players
    .filter((player) => player.id !== localPlayerId && player.seated)
    .map((player) => opponentEstimate(view, player.id, unknownTiles));
  const heatmap = Array.from(
    { length: VARIANT_RULES[view.variant].setSize + 1 },
    (_, pip): PipHeat => ({ pip, probability: combinedProbability(opponents, pip) }),
  );
  const nextPlayerIndex = view.players.findIndex((player) => player.id === localPlayerId);
  const nextPlayer =
    view.players.length > 1
      ? view.players[(nextPlayerIndex + 1) % view.players.length]?.id
      : undefined;
  const nextOpponent = opponents.find((opponent) => opponent.playerId === nextPlayer);
  const rankedMoves = legalMoves(view.yourHand, view.chain, view.variant)
    .map((move): RankedShadowMove => {
      const chain = playTile(view.chain, move.tile, move.end, view.variant);
      const pips = [...new Set(openEnds(chain).map((target) => target.pip))];
      const estimates = nextOpponent ? [nextOpponent] : opponents;
      const responseRisk =
        1 - pips.reduce((miss, pip) => miss * (1 - combinedProbability(estimates, pip)), 1);
      const pipRelief = tilePips(move.tile);
      const doubleBonus = move.tile.low === move.tile.high ? 4 : 0;
      const score = (1 - responseRisk) * 100 + pipRelief * 1.5 + doubleBonus;
      return {
        tile: move.tile,
        end: move.end,
        score,
        responseRisk,
        pipRelief,
        reason: `${Math.round((1 - responseRisk) * 100)}% block chance; sheds ${pipRelief} pips`,
      };
    })
    .sort((a, b) => b.score - a.score || b.pipRelief - a.pipRelief || a.tile.id.localeCompare(b.tile.id));
  return { unknownTiles, opponents, heatmap, rankedMoves, safestMove: rankedMoves[0] ?? null };
}
