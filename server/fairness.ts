import { createHash } from 'node:crypto';
import { createDominoSet, shuffleTiles } from '../shared/engine.js';
import { shuffleCommitmentPayload } from '../shared/fairness.js';
import { VARIANT_RULES, type RuleVariant, type ShuffleProof } from '../shared/types.js';
import { makeNonce } from './rooms.js';

export function createShuffleProof(variant: RuleVariant, seed: string): ShuffleProof {
  const order = shuffleTiles(createDominoSet(VARIANT_RULES[variant].setSize), seed);
  const serverNonce = makeNonce();
  const commitment = createHash('sha256')
    .update(shuffleCommitmentPayload(order, serverNonce))
    .digest('hex');
  return { seed, serverNonce, commitment, revealedOrder: order.map((tile) => tile.id) };
}
