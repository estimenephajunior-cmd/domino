import { expect, test, type Page, type TestInfo } from '@playwright/test';

const PHONE = { width: 390, height: 844 };

async function enterAlias(page: Page, alias: string): Promise<void> {
  await page.getByLabel('Your display name').fill(alias);
}

async function createBlockTable(page: Page): Promise<string> {
  await page.getByRole('radio', { name: 'Block', exact: true }).click();
  await page.getByRole('button', { name: 'Create table', exact: true }).click();
  await expect(page.getByTestId('waiting-room')).toBeVisible();
  return (await page.locator('code').first().innerText()).trim();
}

async function joinTable(page: Page, code: string): Promise<void> {
  await page.getByRole('tab', { name: 'Join', exact: true }).click();
  await page.getByLabel('Room code').fill(code);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByTestId('waiting-room')).toBeVisible();
}

async function pickSeven(page: Page, observer: Page): Promise<void> {
  for (let pick = 0; pick < 7; pick += 1) {
    const available = page.locator('button[data-deal-slot="true"]:enabled').first();
    // Three.js owns the visible tile while this accessible mirror stays
    // screen-reader-only, so wait for authorization and trigger its real click.
    await expect.poll(() => available.count(), { timeout: 15_000 }).toBe(1);
    const before = await observer.locator('button[data-deal-slot="true"]').count();
    await available.evaluate((element) => (element as HTMLButtonElement).click());
    await expect
      .poll(() => observer.locator('button[data-deal-slot="true"]').count(), { timeout: 5_000 })
      .toBeLessThan(before);
  }
}

async function completePhysicalDeal(host: Page, guest: Page): Promise<void> {
  const hostMix = host.getByTestId('mix-tiles');
  const guestMix = guest.getByTestId('mix-tiles');
  if (await hostMix.isVisible().catch(() => false)) await hostMix.click();
  else await guestMix.click();

  // Picking is intentionally independent: each person can fill their rack at
  // their own pace instead of waiting for the other browser after every tile.
  // One player can take all seven without being gated by the other player's
  // turn. The second player then fills their rack from the remaining slots.
  await pickSeven(host, host);
  await pickSeven(guest, host);
  await expect(host.locator('button[data-deal-slot="true"]')).toHaveCount(0);
  await expect(guest.locator('button[data-deal-slot="true"]')).toHaveCount(0);
  await expect(host.locator('button[data-testid^="rack-tile-"]')).toHaveCount(7);
  await expect(guest.locator('button[data-testid^="rack-tile-"]')).toHaveCount(7);
}

async function playTurn(page: Page): Promise<'played' | 'passed' | 'idle'> {
  const playable = page.locator('button[data-testid^="rack-tile-"][data-playable="true"]:enabled').first();
  if (await playable.isVisible().catch(() => false)) {
    const tileId = await playable.getAttribute('data-testid');
    if (!tileId) throw new Error('Playable rack tile has no test id.');
    await playable.click();
    const left = page.getByTestId('play-left');
    const right = page.getByTestId('play-right');
    if (await left.isEnabled().catch(() => false)) await left.click();
    else if (await right.isEnabled().catch(() => false)) await right.click();
    else throw new Error(`No legal end was enabled for ${tileId}.`);
    await page.getByTestId(tileId).click();
    return 'played';
  }

  const pass = page.getByTestId('pass-turn');
  if (await pass.isEnabled().catch(() => false)) {
    await pass.click();
    return 'passed';
  }
  return 'idle';
}

async function assertMobileTableFits(page: Page): Promise<void> {
  const measurements = await page.evaluate(() => {
    const table = document.querySelector<HTMLElement>('[data-testid="table"]');
    const board = document.querySelector<HTMLElement>('[data-testid="board-viewport"]');
    const rack = document.querySelector<HTMLElement>('[data-testid="rack"]');
    const rect = (element: HTMLElement | null) => element?.getBoundingClientRect().toJSON();
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      table: rect(table),
      board: rect(board),
      rack: rect(rack),
    };
  });
  expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.viewportWidth + 1);
  expect(measurements.documentHeight).toBeLessThanOrEqual(measurements.viewportHeight + 1);
  expect(measurements.board?.height ?? 0).toBeGreaterThan(540);
  expect(measurements.rack?.bottom ?? PHONE.height + 1).toBeLessThanOrEqual(PHONE.height);
}

async function screenshotBoth(host: Page, guest: Page, testInfo: TestInfo, label: string) {
  await host.screenshot({ path: testInfo.outputPath(`${label}-host.png`), fullPage: true });
  await guest.screenshot({ path: testInfo.outputPath(`${label}-guest.png`), fullPage: true });
}

test('two mobile players can see and finish a complete hand', async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const hostContext = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  const guestContext = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await host.goto('/');
    await enterAlias(host, 'Ana');
    const code = await createBlockTable(host);

    await guest.goto('/');
    await enterAlias(guest, 'Bob');
    await joinTable(guest, code);
    await expect(host.getByTestId('seat-list').locator('li')).toHaveCount(2);

    await screenshotBoth(host, guest, testInfo, 'waiting');
    await host.getByTestId('toggle-ready').click();
    await guest.getByTestId('toggle-ready').click();
    await expect(host.getByTestId('table')).toBeVisible();
    await expect(guest.getByTestId('table')).toBeVisible();
    await completePhysicalDeal(host, guest);

    await assertMobileTableFits(host);
    await assertMobileTableFits(guest);
    await screenshotBoth(host, guest, testInfo, 'opening');

    let midCaptured = false;
    for (let turn = 0; turn < 80; turn += 1) {
      if ((await host.getByTestId('hand-result').count()) > 0) break;
      const before = await host.getByTestId('board-tile').count();
      const hostAction = await playTurn(host);
      const action = hostAction === 'idle' ? await playTurn(guest) : hostAction;
      expect(action, `Neither player could act on turn ${turn}.`).not.toBe('idle');
      await expect
        .poll(() => host.getByTestId('board-tile').count(), { timeout: 5_000 })
        .toBeGreaterThanOrEqual(before);
      const boardCount = await host.getByTestId('board-tile').count();
      if (!midCaptured && boardCount >= 6) {
        midCaptured = true;
        await screenshotBoth(host, guest, testInfo, 'mid-hand');
      }
    }

    await expect(host.getByTestId('hand-result')).toBeVisible();
    await expect(guest.getByTestId('hand-result')).toBeVisible();
    await assertMobileTableFits(host);
    await screenshotBoth(host, guest, testInfo, 'finished');
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
