import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearCommitments,
  clearStoredSession,
  readStoredSession,
  rememberCommitment,
  roomCodeFromLocation,
  writeStoredSession,
} from '../../src/net/socket';

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('phase 2 browser session lifecycle', () => {
  it('remembers a seat without putting the reconnect secret in the URL', () => {
    writeStoredSession({ code: 'table123', playerId: 'player', token: 'secret-token' });
    expect(readStoredSession()).toEqual({
      code: 'table123',
      playerId: 'player',
      token: 'secret-token',
    });
    expect(window.location.href).not.toContain('secret-token');
    clearStoredSession();
    expect(readStoredSession()).toBeNull();
  });
  it('tolerates corrupt session storage', () => {
    sessionStorage.setItem('domino-session', 'invalid-json');
    expect(readStoredSession()).toBeNull();
    sessionStorage.setItem('domino-session', '{"code":123}');
    expect(readStoredSession()).toBeNull();
  });
  it('pins each hand commitment, rejects replacement and permits a new match after release', () => {
    expect(rememberCommitment('room-a', 1, 'original')).toBe(true);
    expect(rememberCommitment('room-a', 1, 'substituted')).toBe(false);
    expect(rememberCommitment('room-a', 2, 'next')).toBe(true);
    expect(rememberCommitment('room-b', 1, 'other-room')).toBe(true);
    clearCommitments('room-a');
    expect(rememberCommitment('room-a', 1, 'new-match')).toBe(true);
    expect(rememberCommitment('room-b', 1, 'changed')).toBe(false);
  });
  it('reads an invite room from the table route', () => {
    window.history.replaceState(null, '', '/table/domino-12345678');
    expect(roomCodeFromLocation()).toBe('domino-12345678');
  });
});
