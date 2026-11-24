import seedrandom from 'seedrandom';
import type { DominosState } from './dominosGame.js';
import type { MutatorConfig } from './phaseFive.js';

export const DEFAULT_MUTATORS: MutatorConfig = Object.freeze({
  speed: false,
  wildDouble: false,
  hotPotato: false,
});

/** Penalty randomness is replayable and never depends on client input. */
export function applyPassPenalty(state: DominosState, playerId: string): DominosState {
  if (!state.mutators?.hotPotato || state.boneyard.length === 0) return state;
  const random = seedrandom(`${state.seed}:penalty:${state.handNumber}:${state.turn}`);
  const index = Math.floor(random() * state.boneyard.length);
  const penalty = state.boneyard[index]!;
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? { ...player, hand: [...player.hand, penalty] } : player,
    ),
    boneyard: state.boneyard.filter((_, position) => position !== index),
    passStreak: 0,
  };
}
