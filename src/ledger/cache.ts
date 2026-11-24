import Dexie, { type Table } from 'dexie';
import type { LedgerSnapshot } from '../../shared/ledger';

class LedgerCache extends Dexie {
  snapshots!: Table<LedgerSnapshot, string>;

  constructor() {
    super('domino-karmic-ledger');
    this.version(1).stores({ snapshots: '&profileId,generatedAt' });
  }
}

export const ledgerCache = new LedgerCache();
