/**
 * Minimal typings for `web-push`, which ships no types of its own.
 * Only the surface used by this server is declared.
 */
declare module 'web-push' {
  namespace webpush {
    interface PushSubscriptionKeys {
      p256dh: string;
      auth: string;
    }
    interface PushSubscription {
      endpoint: string;
      keys: PushSubscriptionKeys;
    }
    interface VapidKeys {
      publicKey: string;
      privateKey: string;
    }
    function generateVAPIDKeys(): VapidKeys;
    function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    function sendNotification(
      subscription: PushSubscription,
      payload: string | null,
      options?: { TTL?: number },
    ): Promise<void>;
  }
  export = webpush;
}
