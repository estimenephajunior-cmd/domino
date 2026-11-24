import { expect, test, type Page } from '@playwright/test';

async function physicalDeal(pages: Page[]): Promise<void> {
  for (const page of pages) {
    if (await page.getByTestId('mix-tiles').count()) {
      await page.getByTestId('mix-tiles').click();
      break;
    }
  }
  await expect(pages[0]!.getByText(/Your pick|is picking/)).toBeVisible({ timeout: 15000 });
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

test('four browser players configure a table, play a complete hand, verify the shuffle and redeal', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  try {
    for (const [index, page] of pages.entries()) {
      await page.goto('/');
      await page.getByLabel('Your display name').fill(`Player ${index}`);
    }
    const host = pages[0]!;
    await host.getByRole('button', { name: 'Create table' }).click();
    await expect(host.getByTestId('waiting-room')).toBeVisible();
    const code = (await host.locator('code').innerText()).trim();
    await host.getByLabel('Table rules').selectOption('draw');
    for (const page of pages.slice(1)) {
      await page.getByLabel('Room code').fill(code);
      await page.getByRole('button', { name: 'Join', exact: true }).click();
      await expect(page.getByLabel('Table rules')).toBeDisabled();
      await expect(page.getByLabel('Table rules')).toHaveValue('draw');
    }
    await expect(host.getByTestId('seat-list').locator('li')).toHaveCount(4);
    for (const page of pages) await page.getByTestId('toggle-ready').click();
    for (const page of pages) await expect(page.getByTestId('table')).toBeVisible();
    await physicalDeal(pages);
    const commitment = await host.locator('details p').first().textContent();
    // A refresh must preserve the original commitment and private rack.
    const rack = await pages[2]!.getByTestId('rack').locator('button').allTextContents();
    await pages[2]!.reload();
    await expect(pages[2]!.getByTestId('table')).toBeVisible();
    expect(await pages[2]!.getByTestId('rack').locator('button').allTextContents()).toEqual(rack);
    for (let guard = 0; guard < 150; guard++) {
      if (await host.getByTestId('hand-result').count()) break;
      let mover: Page | undefined;
      for (const page of pages) {
        if ((await page.getByTestId('seat-you').textContent())?.includes('to play')) {
          mover = page;
          break;
        }
      }
      expect(mover).toBeDefined();
      const acting = mover!;
      const turnText = await acting.getByTestId('table').locator('header').innerText();
      const playable = acting
        .locator('button[data-testid^="rack-tile-"][data-playable="true"]')
        .first();
      if (await playable.count()) {
        await playable.click();
        const end = acting.locator('button[data-testid^="play-"]:enabled').first();
        await end.click();
        await playable.click();
      } else if (await acting.getByTestId('draw-tile').isEnabled()) {
        await acting.getByTestId('draw-tile').click();
      } else {
        await acting.getByTestId('pass-turn').click();
      }
      await expect
        .poll(async () => {
          if (await host.getByTestId('hand-result').count()) return true;
          return (await acting.getByTestId('table').locator('header').innerText()) !== turnText;
        })
        .toBe(true);
    }
    for (const page of pages) await expect(page.getByTestId('hand-result')).toBeVisible();
    expect(await host.locator('details p').first().textContent()).toBe(commitment);
    await host.getByText('Shuffle fairness', { exact: true }).click();
    await host.getByRole('button', { name: 'Verify shuffle' }).click();
    await expect(host.getByRole('status').filter({ hasText: 'Shuffle verified' })).toBeVisible();
    await pages[3]!.getByTestId('next-hand').click();
    for (const page of pages) {
      await expect(page.getByTestId('hand-result')).toHaveCount(0);
      await expect(page.getByTestId('table').locator('header')).toContainText('Hand 2');
    }
    await pages[3]!.getByRole('button', { name: 'Leave table' }).click();
    await expect(pages[3]!.getByRole('heading', { name: 'Domino Table' })).toBeVisible();
    for (const page of pages.slice(0, 3))
      await expect(page.getByTestId('waiting-room')).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('leaving a waiting room clears the remembered seat', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Your display name').fill('Ana');
  await page.getByRole('button', { name: 'Create table' }).click();
  await expect(page.getByTestId('waiting-room')).toBeVisible();
  await page.getByTestId('leave-room').click();
  await expect(page.getByRole('heading', { name: 'Domino Table' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Domino Table' })).toBeVisible();
});
