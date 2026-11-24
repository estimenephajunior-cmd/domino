import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const ALIASES = ['Ana', 'Bob', 'Cam', 'Dee'] as const;

async function addSyntheticMicrophone(page: Page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext({ sampleRate: 48_000 });
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
  });
}

async function createVoiceTable(browser: Browser, count: 2 | 4) {
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  for (let index = 0; index < count; index += 1) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      permissions: ['microphone'],
    });
    const page = await context.newPage();
    await addSyntheticMicrophone(page);
    contexts.push(context);
    pages.push(page);
  }

  const host = pages[0]!;
  await host.goto('/');
  await host.getByLabel('Your display name').fill(ALIASES[0]);
  await host.getByRole('button', { name: 'Create table', exact: true }).click();
  await expect(host.getByTestId('waiting-room')).toBeVisible();
  const code = (await host.locator('code').first().innerText()).trim();

  for (let index = 1; index < pages.length; index += 1) {
    const page = pages[index]!;
    await page.goto('/');
    await page.getByLabel('Your display name').fill(ALIASES[index]);
    await page.getByRole('tab', { name: 'Join', exact: true }).click();
    await page.getByLabel('Room code').fill(code);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(host.getByTestId('seat-list').locator('li')).toHaveCount(index + 1);
  }
  for (const page of pages) await page.getByTestId('toggle-ready').click();
  for (const page of pages) await expect(page.getByTestId('table')).toBeVisible();
  return { contexts, pages };
}

async function enableVoice(page: Page) {
  await page.getByTestId('voice-enable').click();
  await expect(page.getByTestId('voice-mute')).toBeVisible({ timeout: 15_000 });
  await page.locator('summary[aria-label="Voice settings"]').click();
  await expect(page.getByTestId('voice-mode-ptt')).toBeVisible();
}

test('mobile touch PTT carries audio and peer controls remain usable', async ({ browser }) => {
  test.setTimeout(120_000);
  const { contexts, pages } = await createVoiceTable(browser, 2);
  const [host, guest] = pages as [Page, Page];
  try {
    await enableVoice(host);
    await enableVoice(guest);
    for (const page of pages)
      await expect(page.locator('[data-testid^="voice-peer-"]')).toHaveAttribute(
        'data-connection',
        'connected',
        { timeout: 45_000 },
      );

    await host.getByTestId('voice-mode-ptt').click();
    const ptt = host.getByTestId('voice-ptt');
    await ptt.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', bubbles: true });
    await expect(host.getByTestId('voice-local-activity')).toHaveAttribute('data-speaking', 'true');
    await expect(guest.locator('[data-testid^="voice-peer-"]')).toHaveAttribute(
      'data-speaking',
      'true',
      { timeout: 15_000 },
    );
    await ptt.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', bubbles: true });
    await expect(host.getByTestId('voice-local-activity')).toHaveAttribute('data-speaking', 'false');

    await guest.getByRole('button', { name: 'Mute Ana', exact: true }).click();
    await expect(guest.getByRole('button', { name: 'Unmute Ana', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await guest.getByLabel('Volume for Ana').fill('0.35');
    await expect(guest.getByLabel('Volume for Ana')).toHaveValue('0.35');
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('four mobile players establish the complete six-link voice mesh', async ({ browser }) => {
  test.setTimeout(180_000);
  const { contexts, pages } = await createVoiceTable(browser, 4);
  try {
    for (const page of pages) await enableVoice(page);
    for (const page of pages)
      await expect(
        page.locator('[data-testid^="voice-peer-"][data-connection="connected"]'),
      ).toHaveCount(3, { timeout: 45_000 });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
