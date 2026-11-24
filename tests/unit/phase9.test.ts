import { describe, expect, it } from 'vitest';
import { calculateTitle } from '../../shared/ledger';

describe('phase 9 Karmic Ledger', () => {
  it('assigns deterministic rolling titles', () => {
    expect(calculateTitle({ matches: 5, wins: 4, escapeWins: 0 })).toBe(
      'The Executioner',
    );
    expect(calculateTitle({ matches: 6, wins: 2, escapeWins: 3 })).toBe(
      'The Houdini',
    );
    expect(calculateTitle({ matches: 2, wins: 2, escapeWins: 2 })).toBeNull();
  });
});
