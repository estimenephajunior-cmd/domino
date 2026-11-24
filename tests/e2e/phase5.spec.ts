import { expect, test, type Page } from '@playwright/test';

async function physicalDeal(pages: Page[]): Promise<void> {
  await pages[0]!.getByTestId('mix-tiles').click();
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

test('host configures combined mutators and two players approve a real undo', async ({
  browser,
}) => {
  test.setTimeout(90000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  try {
    const [host, guest] = pages as [Page, Page];
    await host.goto('/');
    await host.getByLabel('Your display name').fill('Ana');
    await host.getByRole('radio', { name: 'Draw', exact: true }).click();
    await host.getByRole('button', { name: 'Create table' }).click();
    await expect(host.getByTestId('waiting-room')).toBeVisible();
    const code = (await host.locator('code').innerText()).trim();
    for (const label of ['Speed Dominoes', 'Wild Double', 'Hot Potato']) {
      await host.getByLabel(label, { exact: true }).click();
      await expect(host.getByLabel(label, { exact: true })).toBeChecked();
    }
    await guest.goto('/');
    await guest.getByLabel('Your display name').fill('Bob');
    await guest.getByLabel('Room code').fill(code);
    await guest.getByRole('button', { name: 'Join', exact: true }).click();
    for (const label of ['Speed Dominoes', 'Wild Double', 'Hot Potato']) {
      await expect(guest.getByLabel(label, { exact: true })).toBeChecked();
      await expect(guest.getByLabel(label, { exact: true })).toBeDisabled();
    }
    await host.getByTestId('toggle-ready').click();
    await guest.getByTestId('toggle-ready').click();
    await physicalDeal(pages);
    for (const page of pages) await expect(page.getByTestId('phase-five-controls')).toBeVisible();
    let actor: Page | undefined;
    let beforeIds: string[] = [];
    let beforeBoard = 0;
    for (let guard = 0; guard < 40; guard++) {
      for (const page of pages) {
        if ((await page.getByTestId('seat-you').textContent())?.includes('to play')) {
          actor = page;
          break;
        }
      }
      expect(actor).toBeDefined();
      const acting = actor!;
      const playable = acting
        .locator('button[data-testid^="rack-tile-"][data-playable="true"]')
        .first();
      if (await playable.count()) {
        beforeIds = await acting
          .locator('button[data-testid^="rack-tile-"]')
          .evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('data-testid')!));
        beforeBoard = await acting.getByTestId('board-tile').count();
        await playable.click();
        await acting.locator('button[data-testid^="play-"]:enabled').first().click();
        await playable.click();
        await expect(
          acting.getByRole('button', { name: 'Request undo', exact: true }),
        ).toBeEnabled();
        await acting.getByRole('button', { name: 'Request undo', exact: true }).click();
        break;
      }
      if (await acting.getByTestId('draw-tile').isEnabled())
        await acting.getByTestId('draw-tile').click();
      else await acting.getByTestId('pass-turn').click();
      actor = undefined;
    }
    expect(actor).toBeDefined();
    for (const page of pages) {
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByTestId('speed-clock')).toHaveText('Clock paused for vote');
    }
    const peer = pages.find((page) => page !== actor)!;
    await peer.getByRole('button', { name: 'Approve undo', exact: true }).click();
    for (const page of pages) {
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByText('Undo approved', { exact: true })).toBeVisible();
    }
    expect(
      await actor!
        .locator('button[data-testid^="rack-tile-"]')
        .evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('data-testid')!)),
    ).toEqual(beforeIds);
    await expect(actor!.getByTestId('board-tile')).toHaveCount(beforeBoard);
    await expect(actor!.getByTestId('seat-you')).toContainText('to play');
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
