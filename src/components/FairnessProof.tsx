import { useState } from 'react';
import { verifyShuffleProof } from '../../shared/fairness';
import { VARIANT_RULES, type PlayerView } from '../../shared/types';

export function FairnessProof({ view }: { readonly view: PlayerView }) {
  const [result, setResult] = useState<{ commitment: string; text: string } | null>(null);
  const proof = view.fairness;
  if (!proof) return null;
  async function verify() {
    if (!proof?.reveal) return;
    try {
      const valid = await verifyShuffleProof(
        proof.reveal,
        VARIANT_RULES[view.variant].setSize,
        proof.commitment,
      );
      setResult({
        commitment: proof.commitment,
        text: valid ? 'Shuffle verified' : 'Shuffle verification failed',
      });
    } catch {
      setResult({ commitment: proof.commitment, text: 'Verification unavailable in this browser' });
    }
  }
  return (
    <details className="text-xs text-slate-400">
      <summary>Shuffle fairness</summary>
      <p className="break-all">Commitment: {proof.commitment}</p>
      {proof.reveal ? (
        <>
          <button type="button" onClick={() => void verify()} className="underline">
            Verify shuffle
          </button>
          <p role="status">
            {result?.commitment === proof.commitment
              ? result.text
              : 'The seed is now available for verification.'}
          </p>
          <pre className="max-h-40 overflow-auto">{JSON.stringify(proof.reveal, null, 2)}</pre>
        </>
      ) : (
        <p>The seed stays secret until this hand ends.</p>
      )}
    </details>
  );
}
