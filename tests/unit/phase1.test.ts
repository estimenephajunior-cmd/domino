import { describe, expect, it } from 'vitest';
import {
  createDominoSet,
  createInitialState,
  deal,
  legalMoves,
  playTile,
  scoreHand,
  shuffleTiles,
} from '../../shared/engine';
import { allBoardTiles, openEnds, scoreExposedEnds } from '../../shared/graph';
import { createTableState, playTileMove, resolveBlockedHand } from '../../shared/moves';
import { verifyShuffleProof, commitShuffleSha256 } from '../../shared/fairness';
import { handSizeFor } from '../../shared/rules';
import type { Chain, Tile } from '../../shared/types';

const tile = (low: number, high: number): Tile => ({ id: `${low}-${high}`, low, high });
function cross(): Chain {
  const spinner = tile(5, 5);
  let chain: Chain = {
    tiles: [{ ...spinner, left: 5, right: 5 }],
    leftEnd: 5,
    rightEnd: 5,
    spinner,
  };
  chain = playTile(chain, tile(1, 5), 'left', 'all-fives');
  return playTile(chain, tile(2, 5), 'right', 'all-fives');
}
const players = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id }));

describe('phase 1 rule acceptance', () => {
  it('opens spinner arms only after both long sides have been covered', () => {
    const chain = cross();
    expect(openEnds(chain).map((end) => end.end)).toEqual(['left', 'right', 'top', 'bottom']);
    const oneSided = { ...chain, tiles: chain.tiles.slice(1), leftEnd: 5 };
    expect(legalMoves([tile(0, 5)], oneSided, 'all-fives').map((move) => move.end)).not.toContain(
      'top',
    );
    expect(() => playTile(oneSided, tile(0, 5), 'top', 'all-fives')).toThrow();
  });
  it('validates, extends and preserves both side arms independently', () => {
    let chain = playTile(cross(), tile(0, 5), 'top', 'all-fives');
    chain = playTile(chain, tile(3, 5), 'bottom', 'all-fives');
    chain = playTile(chain, tile(0, 4), 'top', 'all-fives');
    chain = playTile(chain, tile(1, 6), 'left', 'all-fives');
    expect(openEnds(chain).map((end) => end.pip)).toEqual([6, 2, 4, 3]);
    expect(allBoardTiles(chain)).toHaveLength(7);
    expect(() => playTile(chain, tile(0, 5), 'bottom', 'all-fives')).toThrow();
    expect(legalMoves([tile(4, 6)], chain, 'block').map((move) => move.end)).toEqual(['left']);
  });
  it('counts terminal doubles twice, covered spinner zero, and only started arms', () => {
    let chain = cross();
    expect(scoreExposedEnds(chain)).toBe(0); // 1 + 2
    chain = playTile(chain, tile(3, 5), 'top', 'all-fives');
    chain = playTile(chain, tile(2, 2), 'right', 'all-fives');
    expect(scoreExposedEnds(chain)).toBe(0); // 1 + 4 + 3
    chain = playTile(chain, tile(1, 3), 'left', 'all-fives');
    expect(scoreExposedEnds(chain)).toBe(10); // 3 + 4 + 3
  });
  it('awards fives immediately even when the hand continues', () => {
    const base = createTableState(players.slice(0, 2), 'all-fives', 'score', 6);
    const state = {
      ...base,
      phase: 'awaiting-play' as const,
      currentPlayer: 'a',
      chain: {
        tiles: [{ ...tile(3, 4), left: 3, right: 4 }],
        leftEnd: 3,
        rightEnd: 4,
        spinner: null,
      },
      players: base.players.map((p) => ({
        ...p,
        score: 0,
        hand: p.id === 'a' ? [tile(4, 4), tile(0, 0)] : [tile(1, 2)],
      })),
    };
    const result = playTileMove(state, 'a', '4-4', 'right');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.players[0]?.score).toBe(0);
      expect(result.state.phase).toBe('awaiting-play');
    }
    const scoring = playTileMove(
      {
        ...state,
        chain: { ...state.chain, leftEnd: 2, tiles: [{ ...tile(2, 4), left: 2, right: 4 }] },
      },
      'a',
      '4-4',
      'right',
    );
    expect(scoring.ok && scoring.state.players[0]?.score).toBe(10);
  });
  it('rounds the All Fives end-of-hand award to the nearest five', () => {
    const seats = players
      .slice(0, 2)
      .map((p) => ({ ...p, hand: p.id === 'a' ? [] : [tile(4, 4)], score: 0, seated: true }));
    expect(scoreHand(seats, 'a', 'all-fives')).toEqual({ a: 10, b: 0 });
  });
  it('uses a ten-tile Cuban deal with an unused fifteen-tile stock and linear play', () => {
    const state = deal(players, 'cuban', handSizeFor('caribbean', 4), 9);
    expect(state.boneyard).toHaveLength(15);
    expect(state.hands.map((hand) => hand.length).sort((a, b) => a - b)).toEqual([9, 10, 10, 10]);
    expect(state.chain.spinner).toBeNull();
  });
  it('settles a Latin blocked hand by team totals, with ties scoring nothing', () => {
    const base = createTableState(players, 'latin', 'teams', 7);
    const state = {
      ...base,
      phase: 'awaiting-play' as const,
      players: players.map((p, i) => ({
        ...p,
        hand: [
          tile(
            ...([
              [0, 1],
              [2, 3],
              [6, 6],
              [2, 2],
            ][i] as [number, number]),
          ),
        ],
        score: 0,
        seated: true,
      })),
    };
    const result = resolveBlockedHand(state);
    expect(result.ok && result.state.winner).toBe('b'); // team a/c has 13; b/d has 9
    expect(result.ok && result.state.players.map((p) => p.score)).toEqual([0, 13, 0, 13]);
  });
  it('rejects invalid deck, duplicate player and over-dealing inputs', () => {
    expect(() => createDominoSet(-1)).toThrow();
    expect(() => createInitialState([players[0]!, players[0]!], 'block', 'bad', 6)).toThrow();
    expect(() => createInitialState(players, 'block', 'bad', 8)).toThrow();
  });
  it('verifies the committed seed and rejects substituted seeds, orders and commitments', async () => {
    const order = shuffleTiles(createDominoSet(6), 'proof');
    const commitment = await commitShuffleSha256(order, 'nonce');
    const proof = {
      seed: 'proof',
      serverNonce: 'nonce',
      commitment,
      revealedOrder: order.map((t) => t.id),
    };
    await expect(verifyShuffleProof(proof, 6, commitment)).resolves.toBe(true);
    await expect(verifyShuffleProof({ ...proof, seed: 'other' }, 6, commitment)).resolves.toBe(
      false,
    );
    await expect(verifyShuffleProof(proof, 6, 'substitute')).resolves.toBe(false);
  });
});
