const PROFILE_KEY = 'domino-ledger-profile';

function createProfileId(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return `guest-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function ledgerProfileId(): string {
  try {
    const stored = localStorage.getItem(PROFILE_KEY);
    if (/^guest-[A-Za-z0-9_-]{16,64}$/.test(stored ?? '')) return stored!;
    const created = createProfileId();
    localStorage.setItem(PROFILE_KEY, created);
    return created;
  } catch {
    return createProfileId();
  }
}
