import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const PHONE = { width: 390, height: 844 };
const ALIASES = ['Ana', 'Bob', 'Cam', 'Dee'] as const;

async function createMobileTable(browser: Browser, playerCount: 3 | 4) {
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  for (let index = 0; index < playerCount; index += 1) {
    const context = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
    contexts.push(context);
    pages.push(await context.newPage());
  }

  const host = pages[0]!;
  await host.goto('/');
  await host.getByLabel('Your display name').fill(ALIASES[0]);
  await host.getByRole('radio', { name: 'Block', exact: true }).click();
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
  return { contexts, pages, host };
}

async function pickSeven(page: Page, observer: Page, alias: string) {
  for (let pick = 0; pick < 7; pick += 1) {
    const slot = page.locator('button[data-deal-slot="true"]:enabled').first();
    await expect
      .poll(() => slot.count(), { timeout: 15_000, message: `${alias} pick ${pick + 1}` })
      .toBe(1);
    const before = await observer.locator('button[data-deal-slot="true"]').count();
    await slot.evaluate((element) => (element as HTMLButtonElement).click());
    await expect
      .poll(() => observer.locator('button[data-deal-slot="true"]').count(), { timeout: 5_000 })
      .toBeLessThan(before);
  }
}

async function deal(pages: Page[]) {
  let mixed = false;
  for (const page of pages) {
    const mix = page.getByTestId('mix-tiles');
    if (await mix.isVisible().catch(() => false)) {
      await mix.click();
      mixed = true;
      break;
    }
  }
  expect(mixed).toBe(true);
  for (const [index, page] of pages.entries())
    await pickSeven(page, pages[0]!, ALIASES[index]!);
  for (const page of pages)
    await expect(page.locator('button[data-testid^="rack-tile-"]')).toHaveCount(7);
}

async function takeTurn(page: Page): Promise<'played' | 'passed' | 'idle'> {
  const playable = page.locator(
    'button[data-testid^="rack-tile-"][data-playable="true"]:enabled',
  ).first();
  if (await playable.isVisible().catch(() => false)) {
    const id = await playable.getAttribute('data-testid');
    if (!id) throw new Error('Playable tile is missing its id.');
    await playable.click();
    const end = page.locator('button[data-testid^="play-"]:enabled').first();
    await expect(end).toBeVisible();
    await end.click();
    await page.getByTestId(id).click();
    return 'played';
  }
  const pass = page.getByTestId('pass-turn');
  if (await pass.isEnabled().catch(() => false)) {
    await pass.click();
    return 'passed';
  }
  return 'idle';
}

async function finishHand(pages: Page[]) {
  const observer = pages[0]!;
  for (let turn = 0; turn < 160; turn += 1) {
    if (await observer.getByTestId('hand-result').isVisible().catch(() => false)) return;
    let action: 'played' | 'passed' | 'idle' = 'idle';
    for (const page of pages) {
      action = await takeTurn(page);
      if (action !== 'idle') break;
    }
    expect(action, `No player could act on turn ${turn}.`).not.toBe('idle');
    await observer.waitForTimeout(70);
  }
  throw new Error('The hand did not finish within 160 actions.');
}

async function assertMobileLayout(page: Page) {
  const metrics = await page.evaluate(() => {
    const board = document.querySelector<HTMLElement>('[data-testid="board-viewport"]');
    const rack = document.querySelector<HTMLElement>('[data-testid="rack"]');
    return {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      boardHeight: board?.getBoundingClientRect().height ?? 0,
      rackBottom: rack?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
    };
  });
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.height).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  expect(metrics.boardHeight).toBeGreaterThan(530);
  expect(metrics.rackBottom).toBeLessThanOrEqual(metrics.viewportHeight);
}

for (const playerCount of [3, 4] as const) {
  test(`${playerCount} mobile players complete a hand without corrupting the chain`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(180_000);
    const { contexts, pages, host } = await createMobileTable(browser, playerCount);
    try {
      await host.screenshot({
        path: testInfo.outputPath(`${playerCount}-players-waiting.png`),
        fullPage: true,
      });
      for (const page of pages) await page.getByTestId('toggle-ready').click();
      for (const page of pages) await expect(page.getByTestId('table')).toBeVisible();
      await deal(pages);
      await finishHand(pages);

      for (const page of pages) {
        await assertMobileLayout(page);
        await expect(page.getByTestId('hand-result')).toBeVisible();
        await expect(
          page.locator('[data-testid="board-tile"][data-double="false"][data-vertical="true"]'),
        ).toHaveCount(0);
      }
      await host.screenshot({
        path: testInfo.outputPath(`${playerCount}-players-finished.png`),
        fullPage: true,
      });
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
}
