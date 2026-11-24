import { createDominoSet, shuffleTiles } from './engine.js';
import type { ShuffleProof, Tile } from './types.js';

/**
 * SHA-256 shuffle commitments using the platform's native crypto
 * (Web Crypto `crypto.subtle` — available in Node 22 and all browsers).
 *
 * Flow (hash-before-reveal):
 *   1. Server shuffles with `seedrandom` (deterministic, reproducible).
 *   2. Server publishes `sha256(order + '|' + nonce)` BEFORE dealing.
 *   3. After the hand, the server reveals seed + nonce; anyone re-deals the
 *      shuffle and checks the commitment matches — proof of a fair deal.
 *
 * `seedrandom` alone is NOT treated as a cryptographic primitive (PROJECT.md
 * §10): the commitment binds the server to the order before anyone sees it.
 */

async function sha256Hex(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto (crypto.subtle) is unavailable in this runtime');
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Canonical payload committed for a shuffled deal. */
export function shuffleCommitmentPayload(order: readonly Tile[], nonce: string): string {
  return `${order.map((t) => t.id).join(',')}|${nonce}`;
}

/** Commit to the shuffled tile order before it is revealed. */
export async function commitShuffleSha256(order: readonly Tile[], nonce: string): Promise<string> {
  return sha256Hex(shuffleCommitmentPayload(order, nonce));
}

/** Verify a revealed shuffle against a previously published commitment. */
export async function verifyShuffleSha256(
  order: readonly Tile[],
  nonce: string,
  commitment: string,
): Promise<boolean> {
  return (await commitShuffleSha256(order, nonce)) === commitment.toLowerCase();
}
/** Verify both the revealed order and its independently reproduced shuffle. */
export async function verifyShuffleProof(
  proof: ShuffleProof,
  setSize: 6 | 9,
  expectedCommitment: string,
): Promise<boolean> {
  const order = shuffleTiles(createDominoSet(setSize), proof.seed);
  if (
    proof.commitment !== expectedCommitment ||
    proof.revealedOrder.length !== order.length ||
    order.some((tile, index) => tile.id !== proof.revealedOrder[index])
  )
    return false;
  return verifyShuffleSha256(order, proof.serverNonce, expectedCommitment);
}
