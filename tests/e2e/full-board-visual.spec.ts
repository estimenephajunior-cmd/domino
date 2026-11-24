import { expect, test } from '@playwright/test';

test('all 28 tiles form a readable connected board on a phone', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/');
  await page.addScriptTag({
    type: 'module',
    content: `import { mountFullBoard } from '/tests/fixtures/fullBoard.tsx'; mountFullBoard();`,
  });

  const fixture = page.locator('#full-board-fixture');
  await expect(fixture).toHaveAttribute('data-tile-count', '28');
  await expect(fixture.getByTestId('board')).toHaveAttribute('data-renderer', 'ready', {
    timeout: 30_000,
  });
  await expect(fixture.getByTestId('board-tile')).toHaveCount(28);
  await expect(
    fixture.locator('[data-testid="board-tile"][data-double="false"][data-vertical="true"]'),
  ).toHaveCount(0);
  await expect(
    fixture.locator('[data-testid="board-tile"][data-double="true"][data-vertical="true"]'),
  ).toHaveCount(7);

  const canvas = fixture.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(async () => (await canvas.screenshot()).byteLength).toBeGreaterThan(10_000);
  await page.screenshot({
    path: testInfo.outputPath('complete-28-tile-board.png'),
    fullPage: true,
  });
});
