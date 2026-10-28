import { expect, test } from './fixtures';

/** Every token avatar that is a real image (not the drawn stand-in) and whether it loaded. */
async function logos(scope: import('@playwright/test').Locator) {
  return scope.locator('img.av').evaluateAll((imgs) =>
    (imgs as HTMLImageElement[]).map((i) => ({ src: i.getAttribute('src') ?? '', ok: i.complete && i.naturalWidth > 0 })),
  );
}

test.describe('token logos', () => {
  test('every market on Explore shows both token logos', async ({ page }) => {
    await page.goto('/explore');
    const table = page.locator('table.ex');
    await expect(table.locator('tbody tr')).toHaveCount(18);
    // Logos are lazy-loaded: bring each row into view.
    for (const row of await table.locator('tbody tr').all()) await row.scrollIntoViewIfNeeded();
    await expect.poll(async () => (await logos(table)).filter((l) => l.ok).length).toBe(36);
    for (const l of await logos(table)) expect(l.src).toMatch(/^\/tokens\/[a-z]+\.(png|svg)$/);
  });

  test('stocks, SOL and USDC have logos in the create flow and the ticker', async ({ page }) => {
    await page.goto('/create');
    await expect(page.getByRole('button', { name: /^TSLAx/ }).locator('img.av')).toHaveAttribute('src', '/tokens/tslax.svg');
    await expect(page.getByRole('button', { name: /^SOL/ }).locator('img.av')).toHaveAttribute('src', '/tokens/sol.svg');
    await expect(page.getByRole('button', { name: /^USDC/ }).locator('img.av')).toHaveAttribute('src', '/tokens/usdc.svg');
    const ticker = page.locator('.ticker');
    await expect.poll(async () => (await logos(ticker)).filter((l) => l.ok).length).toBeGreaterThan(10);
  });

  test('the sample-data banner is shown', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('note').filter({ hasText: 'Demo on sample data' })).toContainText(/nothing is sent to Solana (devnet|mainnet) yet/);
  });
});
