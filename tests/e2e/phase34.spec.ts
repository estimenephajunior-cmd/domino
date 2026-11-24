import { test, expect, type Page, type Browser } from '@playwright/test';

test.describe.configure({ timeout: 120000 });

async function physicalDeal(pages: Page[]): Promise<void> {
  for (const page of pages) {
    const mix = page.getByTestId('mix-tiles');
    if (await mix.count()) {
      await mix.click();
      break;
    }
  }
  await expect
    .poll(
      async () =>
        (await Promise.all(
          pages.map((page) => page.locator('button[data-deal-slot="true"]:enabled').count()),
        )).reduce((total, count) => total + count, 0),
      { timeout: 30000 },
    )
    .toBeGreaterThan(0);
  for (let index = 0; index < pages.length * 7; index++) {
    const before = await pages[0]!.locator('button[data-deal-slot="true"]').count();
    let picked = false;
    for (let attempt = 0; attempt < 100 && !picked; attempt++) {
      for (const page of pages) {
        const slot = page.locator('button[data-deal-slot="true"]:enabled').first();
        if (await slot.count()) {
          await slot.evaluate((element) => (element as HTMLButtonElement).click());
          picked = true;
          break;
        }
      }
      if (!picked) await pages[0]!.waitForTimeout(25);
    }
    expect(picked).toBe(true);
    await expect
      .poll(() => pages[0]!.locator('button[data-deal-slot="true"]').count())
      .toBe(index === pages.length * 7 - 1 ? 0 : before - 1);
  }
}

async function table(
  browser: Browser,
  options: {
    voice?: boolean;
    denied?: boolean;
    mobile?: boolean;
    players?: number;
    failedPeer?: boolean;
    noWebGL?: boolean;
  } = {},
) {
  const contexts = await Promise.all(
    Array.from({ length: options.players ?? 2 }, (_, index) => index).map(() =>
      browser.newContext({
        permissions: options.voice && !options.denied ? ['microphone'] : [],
        viewport: options.mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      }),
    ),
  );
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  for (const page of pages) {
    await page.addInitScript(
      ({ denied, synthetic, failedPeer, noWebGL }) => {
        if (noWebGL) {
          const getContext = HTMLCanvasElement.prototype.getContext;
          Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            value: function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
              return type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl'
                ? null
                : Reflect.apply(getContext, this, [type, ...args]);
            },
          });
          const appendChild = Node.prototype.appendChild;
          Node.prototype.appendChild = function <T extends Node>(node: T): T {
            if (node instanceof HTMLCanvasElement) throw new Error('Simulated canvas failure');
            return Reflect.apply(appendChild, this, [node]) as T;
          };
        }
        const NativeAudio = window.AudioContext;
        const audioContexts: AudioContext[] = [];
        (window as unknown as { testAudio: AudioContext[] }).testAudio = audioContexts;
        window.AudioContext = class extends NativeAudio {
          constructor(options?: AudioContextOptions) {
            super(options);
            audioContexts.push(this);
          }
        };
        const nativeMic = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          try {
            return await nativeMic(constraints);
          } catch (error) {
            (window as unknown as { testMicError: string }).testMicError = String(error);
            throw error;
          }
        };
        if (denied)
          navigator.mediaDevices.getUserMedia = async () => {
            throw new DOMException('Denied for test', 'NotAllowedError');
          };
        if (synthetic)
          navigator.mediaDevices.getUserMedia = async () => {
            const context = new AudioContext({ sampleRate: 48000 });
            const destination = context.createMediaStreamDestination();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.frequency.value = 220;
            gain.gain.value = 0.25;
            oscillator.connect(gain);
            gain.connect(destination);
            oscillator.start();
            await context.resume();
            destination.stream.getAudioTracks()[0]!.addEventListener('ended', () => {
              oscillator.stop();
              void context.close();
            });
            return destination.stream;
          };
        const NativeSocket = window.WebSocket;
        const sockets: WebSocket[] = [];
        (window as unknown as { testSockets: WebSocket[] }).testSockets = sockets;
        window.WebSocket = class extends NativeSocket {
          constructor(url: string | URL, protocols?: string | string[]) {
            super(url, protocols);
            sockets.push(this);
          }
        };
        const Native = window.RTCPeerConnection;
        const peers: RTCPeerConnection[] = [];
        (window as unknown as Window & { testPeers: RTCPeerConnection[] }).testPeers = peers;
        window.RTCPeerConnection = class extends Native {
          constructor(config?: RTCConfiguration) {
            super(config);
            if (failedPeer) {
              this.close();
              throw new Error('Simulated blocked peer connection');
            }
            peers.push(this);
          }
        };
      },
      {
        denied: options.denied ?? false,
        synthetic: options.voice ?? false,
        failedPeer: options.failedPeer ?? false,
        noWebGL: options.noWebGL ?? false,
      },
    );
  }
  const [host, guest] = pages as [Page, Page];
  await host.goto('/');
  await host.getByLabel('Your display name').fill('Ana');
  await host.getByRole('radio', { name: 'Draw', exact: true }).click();
  await host.getByRole('button', { name: 'Create table' }).click();
  await expect(host.getByTestId('waiting-room')).toBeVisible();
  const code = (await host.locator('code').innerText()).trim();
  for (const [index, page] of pages.entries()) {
    if (!index) continue;
    await page.goto('/');
    await page.getByLabel('Your display name').fill(['Ana', 'Bob', 'Cam', 'Dee'][index]!);
    await page.getByLabel('Room code').fill(code);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(host.getByTestId('seat-list').locator('li')).toHaveCount(index + 1);
  }
  for (const page of pages) await page.getByTestId('toggle-ready').click();
  for (const page of pages) await expect(page.getByTestId('table')).toBeVisible();
  await physicalDeal(pages);
  return { contexts, pages, host, guest };
}
async function playableActor(pages: Page[]) {
  for (let i = 0; i < 40; i++) {
    const actor = (
      await Promise.all(
        pages.map(async (page) => ({
          page,
          turn: (await page.getByTestId('seat-you').textContent())?.includes('turn'),
        })),
      )
    ).find((entry) => entry.turn)?.page;
    if (!actor) continue;
    const tile = actor.locator('button[data-testid^="rack-tile-"][data-playable="true"]').first();
    if (await tile.count()) return { actor, tile };
    if (await actor.getByTestId('draw-tile').isEnabled())
      await actor.getByTestId('draw-tile').click();
    else await actor.getByTestId('pass-turn').click();
  }
  throw new Error('No playable move found');
}

async function enableVoiceSettings(page: Page): Promise<void> {
  await page.getByTestId('voice-enable').click();
  await expect(page.getByTestId('voice-mute')).toBeVisible({ timeout: 15000 });
  await page.locator('summary[aria-label="Voice settings"]').click();
  await expect(page.getByTestId('voice-mode-ptt')).toBeVisible();
}

test('Three.js renders; a rack tile drags to a glowing end and commits on both clients', async ({
  browser,
}) => {
  const { contexts, pages, host } = await table(browser);
  try {
    await expect(host.getByTestId('board')).toHaveAttribute('data-renderer', 'ready', {
      timeout: 30000,
    });
    await expect(host.getByTestId('three-board').locator('canvas')).toBeVisible();
    const { actor, tile } = await playableActor(pages);
    const id = await tile.getAttribute('data-testid');
    await tile.click();
    const target = actor.locator('[data-testid^="drop-"][data-legal="true"]').first();
    await expect(target).toBeVisible();
    const before = await actor.getByTestId('board-tile').count();
    const start = (await tile.boundingBox())!;
    const end = (await target.boundingBox())!;
    await actor.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await actor.mouse.down();
    await actor.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 24 });
    await expect(actor.getByTestId('drag-overlay-tile')).toBeVisible();
    await expect(actor.getByTestId('drag-preview')).toHaveAttribute('data-snapped', 'true');
    await expect(actor.getByTestId('placement-preview')).toBeVisible();
    await actor.mouse.up();
    for (const page of pages) await expect(page.getByTestId('board-tile')).toHaveCount(before + 1);
    await expect(actor.getByTestId(id!)).toHaveCount(0);
    await actor.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await actor.getByRole('button', { name: 'Fit board', exact: true }).click();
    await actor.screenshot({ path: 'test-results/phase34-table.png' });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('mobile table fits the viewport and denied microphone leaves gameplay and chat usable', async ({
  browser,
}) => {
  const { contexts, pages, host, guest } = await table(browser, { denied: true, mobile: true });
  try {
    await host.getByTestId('voice-enable').click();
    await expect(host.getByText('Microphone access denied.', { exact: false })).toBeVisible();
    expect(
      await host.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1),
    ).toBe(true);
    await host.setViewportSize({ width: 844, height: 390 });
    await expect
      .poll(async () => (await host.getByTestId('board-viewport').boundingBox())?.height ?? 0)
      .toBeGreaterThan(100);
    expect(
      await host.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1),
    ).toBe(true);
    await expect(host.getByTestId('voice-enable')).toBeVisible();
    await host.screenshot({ path: 'test-results/phase34-landscape.png' });
    await host.getByTestId('chat-toggle').click();
    await host.getByLabel('Chat message').fill('Still playing with voice off');
    await host.getByRole('button', { name: 'Send', exact: true }).click();
    await guest.getByTestId('chat-toggle').click();
    await expect(guest.getByText('Still playing with voice off', { exact: true })).toBeVisible();
    await host.getByRole('button', { name: 'Close chat' }).click();
    await guest.getByRole('button', { name: 'Close chat' }).click();
    const { actor, tile } = await playableActor(pages);
    const before = await actor.getByTestId('board-tile').count();
    await tile.click();
    await actor.locator('button[data-testid^="play-"]:enabled').first().click();
    await tile.click();
    await expect(actor.getByTestId('board-tile')).toHaveCount(before + 1);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('real WebRTC mesh carries gated audio, supports peer controls, RNNoise and reconnect cleanup', async ({
  browser,
}) => {
  test.setTimeout(120000);
  const { contexts, pages, host, guest } = await table(browser, { voice: true });
  try {
    for (const page of pages) {
      await enableVoiceSettings(page);
      try {
        await expect(page.getByTestId('voice-mode-ptt')).toBeVisible({ timeout: 15000 });
      } catch (error) {
        throw new Error(
          `${String(error)} Microphone: ${await page.evaluate(() => (window as unknown as { testMicError: string }).testMicError)}`,
        );
      }
      await page.getByTestId('voice-mode-ptt').click();
    }
    for (const page of pages)
      await expect(page.locator('[data-testid^="voice-peer-"]')).toHaveAttribute(
        'data-connection',
        'connected',
        { timeout: 45000 },
      );
    await host.bringToFront();
    await host.getByTestId('voice-ptt').focus();
    await host.keyboard.down('Space');
    await expect(host.getByTestId('voice-local-activity')).toHaveAttribute('data-speaking', 'true');
    try {
      await expect(guest.locator('[data-testid^="voice-peer-"]')).toHaveAttribute(
        'data-speaking',
        'true',
        { timeout: 15000 },
      );
    } catch (error) {
      const diagnostics = await Promise.all(
        pages.map((page) =>
          page.evaluate(async () => {
            const globals = window as unknown as {
              testAudio: AudioContext[];
              testPeers: RTCPeerConnection[];
            };
            const connections = await Promise.all(
              globals.testPeers.map(async (peer) => {
                const stats: RTCStats[] = [];
                (await peer.getStats()).forEach((stat) => {
                  if (['media-source', 'inbound-rtp', 'outbound-rtp'].includes(stat.type))
                    stats.push(stat);
                });
                return {
                  state: peer.connectionState,
                  senders: peer.getSenders().map((sender) => ({
                    enabled: sender.track?.enabled,
                    state: sender.track?.readyState,
                  })),
                  stats,
                };
              }),
            );
            return {
              audio: globals.testAudio.map((context) => context.state),
              connections,
              local: document
                .querySelector('[data-testid="voice-local-activity"]')
                ?.getAttribute('data-speaking'),
            };
          }),
        ),
      );
      throw new Error(`${String(error)} ${JSON.stringify(diagnostics)}`);
    }
    await host.keyboard.up('Space');
    await expect(host.getByTestId('voice-local-activity')).toHaveAttribute(
      'data-speaking',
      'false',
    );
    await host.getByTestId('chat-toggle').click();
    await host.getByLabel('Chat message').fill('space');
    await host.getByLabel('Chat message').press('Space');
    await host.getByLabel('Chat message').pressSequentially('stays in chat');
    await expect(host.getByLabel('Chat message')).toHaveValue('space stays in chat');
    await expect(host.getByTestId('voice-local-activity')).toHaveAttribute(
      'data-speaking',
      'false',
    );
    await host.getByRole('button', { name: 'Close chat' }).click();
    await guest.getByRole('button', { name: 'Mute Ana', exact: true }).click();
    await expect(guest.getByRole('button', { name: 'Mute Ana', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await guest.getByLabel('Volume for Ana').fill('0.35');
    await expect(guest.getByLabel('Volume for Ana')).toHaveValue('0.35');
    await host.getByTestId('voice-noise').click();
    await expect(host.getByTestId('voice-noise')).toContainText('RNNoise on', { timeout: 30000 });
    await expect(host.getByTestId('voice-detector')).toHaveText('Speech VAD', { timeout: 45000 });
    await contexts[0]!.setOffline(true);
    await host.evaluate(() => {
      (window as unknown as { testSockets: WebSocket[] }).testSockets
        .filter((socket) => socket.url.includes('/socket.io'))
        .forEach((socket) => socket.close());
    });
    await expect(host.getByText('Reconnecting to the table...', { exact: false })).toBeVisible({
      timeout: 15000,
    });
    await contexts[0]!.setOffline(false);
    for (const page of pages)
      await expect(page.locator('[data-testid^="voice-peer-"]')).toHaveAttribute(
        'data-connection',
        'connected',
        { timeout: 45000 },
      );
    await host.getByTestId('voice-disable').click();
    await expect(host.getByTestId('voice-enable')).toBeVisible();
    expect(
      await host.evaluate(() =>
        (window as unknown as Window & { testPeers: RTCPeerConnection[] }).testPeers.every(
          (peer) => peer.connectionState === 'closed',
        ),
      ),
    ).toBe(true);
    await expect(guest.locator('[data-testid^="voice-peer-"]')).toContainText('voice off');
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('four players establish all six mesh links with locally rotated seats', async ({
  browser,
}) => {
  test.setTimeout(180000);
  const { contexts, pages } = await table(browser, { voice: true, players: 4 });
  try {
    for (const page of pages) {
      await expect(page.getByTestId('seat-you')).toHaveAttribute('data-position', 'bottom');
      await enableVoiceSettings(page);
      await page.getByTestId('voice-mode-ptt').click();
    }
    for (const page of pages) {
      await expect(
        page.locator('[data-testid^="voice-peer-"][data-connection="connected"]'),
      ).toHaveCount(3, { timeout: 45000 });
      const count = await page.evaluate(
        () =>
          (window as unknown as { testPeers: RTCPeerConnection[] }).testPeers.filter(
            (peer) => peer.connectionState === 'connected',
          ).length,
      );
      expect(count).toBe(3);
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('failed P2P is visible and leaves the authoritative game playable', async ({ browser }) => {
  test.setTimeout(60000);
  const { contexts, pages, host } = await table(browser, { voice: true, failedPeer: true });
  const errors: string[] = [];
  pages.forEach((page) => page.on('pageerror', (error) => errors.push(error.message)));
  try {
    for (const page of pages) {
      await enableVoiceSettings(page);
    }
    await expect(
      host.getByText('A voice connection is unavailable.', { exact: false }),
    ).toBeVisible();
    const { actor, tile } = await playableActor(pages);
    const before = await actor.getByTestId('board-tile').count();
    await tile.click();
    await actor.locator('button[data-testid^="play-"]:enabled').first().click();
    await tile.click();
    for (const page of pages) await expect(page.getByTestId('board-tile')).toHaveCount(before + 1);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('WebGL failure keeps the DOM board and keyboard placement usable', async ({ browser }) => {
  const { contexts, pages, host } = await table(browser, { noWebGL: true });
  try {
    await expect(host.getByTestId('board')).toHaveAttribute('data-renderer', 'fallback');
    const { actor, tile } = await playableActor(pages);
    const before = await actor.getByTestId('board-tile').count();
    await tile.focus();
    await tile.press('Enter');
    const end = actor.locator('button[data-testid^="play-"]:enabled').first();
    await end.press('Enter');
    await tile.press('Enter');
    for (const page of pages) await expect(page.getByTestId('board-tile')).toHaveCount(before + 1);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
