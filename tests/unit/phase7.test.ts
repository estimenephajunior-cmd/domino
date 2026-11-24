import { describe, expect, it } from 'vitest';
import { analyzeShadow } from '../../shared/shadow';
import type { PlayerView } from '../../shared/types';

function view(actions: PlayerView['publicActions'] = []): PlayerView {
  return {
    players: [
      { id: 'me', name: 'Ana', handCount: 2, score: 0, seated: true },
      { id: 'them', name: 'Bob', handCount: 5, score: 0, seated: true },
    ],
    chain: {
      tiles: [{ id: '3-4', low: 3, high: 4, left: 3, right: 4 }],
      leftEnd: 3,
      rightEnd: 4,
      spinner: null,
    },
    boneyardCount: 14,
    phase: 'awaiting-play',
    currentPlayer: 'me',
    turn: 3,
    variant: 'draw',
    winner: null,
    lastMove: null,
    seed: '',
    yourHand: [
      { id: '1-3', low: 1, high: 3 },
      { id: '4-6', low: 4, high: 6 },
    ],
    handNumber: 1,
    blocked: false,
    drawing: false,
    dealerId: 'me',
    currentPickerId: null,
    mixingEndsAt: null,
    dealSlots: [],
    picksByPlayer: { me: 2, them: 5 },
    publicActions: actions,
  };
}

describe('phase 7 Shadow Predictor', () => {
  it('removes the local rack and visible board from the remaining tile model', () => {
    const analysis = analyzeShadow(view(), 'me');
    expect(analysis.unknownTiles).toHaveLength(25);
    expect(analysis.unknownTiles.map((tile) => tile.id)).not.toContain('1-3');
    expect(analysis.unknownTiles.map((tile) => tile.id)).not.toContain('3-4');
  });

  it('uses passes as negative evidence and draws to restore uncertainty', () => {
    const passed = analyzeShadow(
      view([{ type: 'pass', playerId: 'them', openPips: [3, 4], turn: 2 }]),
      'me',
    );
    const drawn = analyzeShadow(
      view([
        { type: 'pass', playerId: 'them', openPips: [3, 4], turn: 2 },
        { type: 'draw', playerId: 'them', count: 1, turn: 3 },
      ]),
      'me',
    );
    expect(passed.opponents[0]!.pipProbabilities[3]).toBeLessThan(
      drawn.opponents[0]!.pipProbabilities[3]!,
    );
  });

  it('ranks only legal local moves and supplies a safest suggestion', () => {
    const analysis = analyzeShadow(view(), 'me');
    expect(analysis.rankedMoves).toHaveLength(2);
    expect(analysis.rankedMoves.every((move) => ['1-3', '4-6'].includes(move.tile.id))).toBe(true);
    expect(analysis.safestMove).toBe(analysis.rankedMoves[0]);
  });
});
