import webpush from 'web-push';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { RoomStore } from './rooms.js';

/**
 * Web Push (VAPID) support.
 *
 * Keys are generated once and persisted in `vapid-keys.json` so that push
 * subscriptions survive server restarts. When no keys exist, push is simply
 * disabled and every send is a no-op — the game keeps working.
 */

interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const KEY_FILE = process.env.DOMINO_VAPID_FILE ?? 'vapid-keys.json';

function loadOrCreateKeys(): VapidKeys {
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:domino@example.com';

  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
      subject,
    };
  }

  try {
    if (existsSync(KEY_FILE)) {
      const parsed = JSON.parse(readFileSync(KEY_FILE, 'utf8')) as VapidKeys;
      return { ...parsed, subject };
    }
    const generated = webpush.generateVAPIDKeys();
    const keys: VapidKeys = {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      subject,
    };
    writeFileSync(KEY_FILE, JSON.stringify(keys, null, 2));
    return keys;
  } catch {
    // Read-only filesystem: run without persistence.
    const generated = webpush.generateVAPIDKeys();
    return { publicKey: generated.publicKey, privateKey: generated.privateKey, subject };
  }
}

export const VAPID_KEYS: VapidKeys = loadOrCreateKeys();

webpush.setVapidDetails(VAPID_KEYS.subject, VAPID_KEYS.publicKey, VAPID_KEYS.privateKey);

/** Subscribe a browser push subscription for a player. */
export function saveSubscription(
  store: RoomStore,
  holderId: string,
  subscription: webpush.PushSubscription,
): void {
  const statement = store.db.prepare(
    `INSERT INTO push_subscriptions (endpoint, holder_id, p256dh, auth)
     VALUES (@endpoint, @holder_id, @p256dh, @auth)
     ON CONFLICT(endpoint) DO UPDATE SET holder_id = excluded.holder_id`,
  );
  statement.run({
    endpoint: subscription.endpoint,
    holder_id: holderId,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
  });
}

/** Send a push notification to every stored subscriber. */
export async function sendPushToAll(
  store: RoomStore,
  payload: { title: string; body: string } = {
    title: 'Domino Engine',
    body: 'Your table is waiting.',
  },
): Promise<void> {
  const rows = store.db
    .prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions')
    .all() as { endpoint: string; p256dh: string; auth: string }[];

  await Promise.allSettled(
    rows.map(async (row) => {
      const subscription: webpush.PushSubscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        await webpush.sendNotification(
          subscription,
          JSON.stringify({ ...payload, id: randomBytes(8).toString('hex') }),
        );
      } catch {
        // Stale subscription (410/404) — drop it.
        store.db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(row.endpoint);
      }
    }),
  );
}
