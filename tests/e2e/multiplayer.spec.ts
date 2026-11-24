import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 3 acceptance: two browser tabs drive one real table.
 *
 * The client is a thin renderer over the authoritative server, so this suite
 * asserts the whole loop: create a table, join from a second tab, ready up,
 * receive a private rack, and play a legal tile that lands on the board.
 */

/** Set the display name in the lobby before the tab joins a room. */
async function setName(page: Page, name: string): Promise<void> {
  await page.getByLabel('Your display name').fill(name);
}

/** Create a table and return its code. */
async function createTable(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Create table' }).click();
  await expect(page.getByTestId('waiting-room')).toBeVisible();
  return (await page.locator('code').first().innerText()).trim();
}

/** Read the rack tile ids currently rendered for this player. */
async function rackTileIds(page: Page): Promise<string[]> {
  const tiles = await page.getByTestId('rack').locator('button[data-testid^="rack-tile-"]').all();
  const ids: string[] = [];
  for (const tile of tiles) {
    const id = await tile.getAttribute('data-testid');
    if (id) ids.push(id.replace('rack-tile-', ''));
  }
  return ids;
}

/** The id of the first tile the engine marks as playable for this player. */
async function firstPlayableTileId(page: Page): Promise<string | null> {
  const tile = page.locator('button[data-testid^="rack-tile-"][data-playable="true"]').first();
  if ((await tile.count()) === 0) return null;
  const id = await tile.getAttribute('data-testid');
  return id ? id.replace('rack-tile-', '') : null;
}

/** True when this page shows the player whose turn it is. */
async function isPlayerToMove(page: Page, name: string): Promise<boolean> {
  const panel = page.getByTestId('seat-panel');
  return (await panel.locator('div', { hasText: name }).locator('text=to play').count()) > 0;
}

async function physicalDeal(pages: Page[]): Promise<void> {
  for (const page of pages) {
    const mix = page.getByTestId('mix-tiles');
    if (await mix.count()) {
      await mix.click();
      break;
    }
  }
  await expect(pages[0]!.getByText(/Your pick|is picking/)).toBeVisible({ timeout: 15000 });
  const picks = pages.length * 7;
  for (let index = 0; index < picks; index++) {
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
      .toBe(index === picks - 1 ? 0 : before - 1);
  }
  await Promise.all(pages.map((page) => expect(page.getByTestId('rack')).toBeVisible()));
}

test.describe('multiplayer table', () => {
  test('invite links wait for an editable three-character alias', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    try {
      await host.goto('/');
      await setName(host, 'Ana');
      const code = await createTable(host);
      await guest.goto(`/table/${code}`);
      await expect(guest.getByLabel('Room code')).toHaveValue(code);
      const alias = guest.getByLabel('Your display name');
      await expect(alias).toHaveValue('');
      await alias.fill('Player');
      await alias.fill('');
      await expect(alias).toHaveValue('');
      await alias.fill('Bo');
      await expect(guest.getByRole('button', { name: 'Join', exact: true })).toBeDisabled();
      await alias.fill('Bob');
      await guest.getByRole('button', { name: 'Join', exact: true }).click();
      await expect(guest.getByTestId('waiting-room')).toContainText('Bob');
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('two tabs share one table and play a legal tile', async ({ browser }) => {
    test.setTimeout(60_000);
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    try {
      // --- host creates the table ---
      await host.goto('/');
      await expect(host.getByRole('heading', { name: 'Domino Table' })).toBeVisible();
      await setName(host, 'Ana');
      const code = await createTable(host);
      expect(code.length).toBeGreaterThan(3);

      // --- guest joins with the code ---
      await guest.goto('/');
      await setName(guest, 'Bob');
      await guest.getByLabel('Room code').fill(code);
      await guest.getByRole('button', { name: 'Join' }).click();

      // Both tabs see two seats in the waiting room.
      await expect(host.getByTestId('seat-list').locator('li')).toHaveCount(2);
      await expect(guest.getByTestId('seat-list').locator('li')).toHaveCount(2);

      // --- both ready up: the server deals ---
      await host.getByTestId('toggle-ready').click();
      await guest.getByTestId('toggle-ready').click();

      await expect(host.getByTestId('table')).toBeVisible();
      await expect(guest.getByTestId('table')).toBeVisible();
      await physicalDeal([host, guest]);

      // --- private racks: each player sees their own tiles ---
      const hostTiles = await rackTileIds(host);
      const guestTiles = await rackTileIds(guest);
      expect(hostTiles.length).toBeGreaterThan(0);
      expect(guestTiles.length).toBeGreaterThan(0);
      // Racks differ: two players hold different tiles.
      expect(hostTiles).not.toEqual(guestTiles);

      // --- exactly one player is to move ---
      const hostMoves = await isPlayerToMove(host, 'Ana');
      const guestMoves = await isPlayerToMove(guest, 'Bob');
      expect(hostMoves).not.toBe(guestMoves);

      const mover = hostMoves ? host : guest;
      const idle = hostMoves ? guest : host;

      // The idle player's tiles are not selectable.
      await expect(idle.locator('button[data-testid^="rack-tile-"]').first()).toBeDisabled();

      // --- the mover plays a legal tile (or passes when blocked) ---
      const tileId = await firstPlayableTileId(mover);
      const before = await mover.getByTestId('board-tile').count();

      if (tileId === null) {
        // No tile matches either open end: the mover is blocked.
        await expect(mover.getByTestId('pass-turn')).toBeEnabled();
        await mover.getByTestId('pass-turn').click();
        // The turn moves on; the board is unchanged.
        await expect(mover.getByTestId('board-tile')).toHaveCount(before);
      } else {
        await mover.locator(`[data-testid="rack-tile-${tileId}"]`).click();

        // The end buttons enable only for legal placements.
        const leftEnabled = await mover.getByTestId('play-left').isEnabled();
        const rightEnabled = await mover.getByTestId('play-right').isEnabled();
        expect(leftEnabled || rightEnabled).toBe(true);

        await (
          leftEnabled ? mover.getByTestId('play-left') : mover.getByTestId('play-right')
        ).click();
        // Clicking the selected tile again commits the play.
        await mover.locator(`[data-testid="rack-tile-${tileId}"]`).click();

        await expect(mover.getByTestId('board-tile')).toHaveCount(before + 1);
        // The other client sees the same board.
        await expect(idle.getByTestId('board-tile')).toHaveCount(before + 1);
        // The played tile left the mover's rack.
        expect(await rackTileIds(mover)).not.toContain(tileId);
      }
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('a dropped connection reclaims the seat and the private rack', async ({ browser }) => {
    test.setTimeout(60_000);
    const context = await browser.newContext();
    const page = await context.newPage();
    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();

    try {
      await page.goto('/');
      await setName(page, 'Ana');
      const code = await createTable(page);

      await guest.goto('/');
      await setName(guest, 'Bob');
      await guest.getByLabel('Room code').fill(code);
      await guest.getByRole('button', { name: 'Join' }).click();
      await expect(page.getByTestId('seat-list').locator('li')).toHaveCount(2);

      await page.getByTestId('toggle-ready').click();
      await guest.getByTestId('toggle-ready').click();
      await expect(page.getByTestId('table')).toBeVisible();
      await physicalDeal([page, guest]);

      const tilesBefore = await rackTileIds(page);
      expect(tilesBefore.length).toBeGreaterThan(0);

      // A page refresh drops the transport. The client reconnects and
      // reclaims its seat with the stored session token, keeping the hand.
      await page.reload();
      await expect(page.getByTestId('table')).toBeVisible({ timeout: 15000 });

      // The seat and the rack survived the round trip.
      await expect(page.getByTestId('seat-panel')).toBeVisible();
      expect(await rackTileIds(page)).toEqual(tilesBefore);
      // The table still shows both players.
      await expect(page.getByTestId('seat-panel').locator('> div')).toHaveCount(2);
    } finally {
      await context.close();
      await guestContext.close();
    }
  });

  test('soundboard fallback, mixer, lofi, and themes work at a live table', async ({ browser }) => {
    test.setTimeout(150_000);
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    try {
      await host.goto('/');
      await setName(host, 'Ana');
      const code = await createTable(host);
      await guest.goto('/');
      await setName(guest, 'Bob');
      await guest.getByLabel('Room code').fill(code);
      await guest.getByRole('button', { name: 'Join' }).click();
      await host.getByTestId('toggle-ready').click();
      await guest.getByTestId('toggle-ready').click();
      await expect(host.getByTestId('table')).toBeVisible();
      await physicalDeal([host, guest]);

      await host.getByText('Theme', { exact: true }).click();
      await host.getByTestId('theme-cyberpunk').click();
      await expect.poll(() => host.evaluate(() => document.documentElement.dataset.theme)).toBe(
        'cyberpunk',
      );

      await host.getByText('Lounge audio', { exact: true }).click();
      await guest.getByText('Lounge audio', { exact: true }).click();
      await host.getByLabel('Master volume').fill('0.6');
      await expect(host.getByLabel('Master volume')).toHaveValue('0.6');
      await host.getByTestId('sound-applause').click();
      await expect(guest.getByText('Ana played applause.', { exact: true })).toBeVisible();
      await host.getByTestId('sound-laugh').click();
      await expect(host.getByText('Soundboard cooling down.', { exact: true })).toBeVisible();

      await host.getByTestId('lofi-toggle').click();
      await expect(host.getByTestId('lofi-toggle')).toHaveAttribute('aria-pressed', 'true');
      await host.getByTestId('lofi-toggle').click();
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
});
