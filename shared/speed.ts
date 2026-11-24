import type { DominosState } from './dominosGame.js';
import { hasLegalMove } from './engine.js';
import { applyPassPenalty } from './mutators.js';
import { resolveBlockedHand, type MoveOutcome } from './moves.js';
import { VARIANT_RULES } from './types.js';

/** Server deadlines may skip a playable turn; ordinary players cannot force this action. */
export function timeoutMove(state: DominosState, playerId: string): MoveOutcome {
  if (
    state.phase !== 'awaiting-play' ||
    state.currentPlayer !== playerId ||
    !state.mutators?.speed
  ) {
    return { ok: false, reason: 'This turn cannot time out.' };
  }
  const penalized = applyPassPenalty(state, playerId);
  const canContinue =
    state.players.some((p) => hasLegalMove(p.hand, state.chain, state.variant)) ||
    (VARIANT_RULES[state.variant].allowDraw && state.boneyard.length > 0);
  const passStreak = penalized === state && !canContinue ? state.passStreak + 1 : 0;
  const next = {
    ...penalized,
    drawing: false,
    blocked: !canContinue,
    turn: state.turn + 1,
    passStreak,
  };
  return passStreak >= state.players.length ? resolveBlockedHand(next) : { ok: true, state: next };
}
