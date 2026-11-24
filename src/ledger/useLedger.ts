import { useCallback, useEffect, useState } from 'react';
import type { LedgerSnapshot } from '../../shared/ledger';
import { useTableStore } from '../state/tableStore';
import { ledgerCache } from './cache';
import { ledgerProfileId } from './profile';

export function useLedger() {
  const phase = useTableStore((state) => state.view?.phase);
  const handNumber = useTableStore((state) => state.view?.handNumber);
  const [snapshot, setSnapshot] = useState<LedgerSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const profileId = ledgerProfileId();
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/ledger/${encodeURIComponent(profileId)}`);
      if (!response.ok) throw new Error('Ledger unavailable');
      const next = (await response.json()) as LedgerSnapshot;
      setSnapshot(next);
      await ledgerCache.snapshots.put(next);
    } catch {
      setSnapshot((await ledgerCache.snapshots.get(profileId)) ?? null);
    } finally {
      setLoading(false);
    }
  }, [profileId]);
  useEffect(() => {
    void ledgerCache.snapshots.get(profileId).then((cached) => cached && setSnapshot(cached));
  }, [profileId]);
  useEffect(() => {
    if (phase !== 'hand-complete') return;
    queueMicrotask(() => void refresh());
  }, [phase, handNumber, refresh]);

  return { snapshot, loading, refresh };
}
