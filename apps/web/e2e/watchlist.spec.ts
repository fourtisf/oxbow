import { expect, test } from './fixtures';

test.describe('explore: watchlist and address search', () => {
  test('starred pools persist and filter the list', async ({ page }) => {
    await page.goto('/explore');
    const count = page.locator('.count');
    await page.getByRole('button', { name: 'Watchlist', exact: true }).click();
    await expect(page.getByText('Your watchlist is empty.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Watchlist', exact: true }).click();

    await page.getByRole('button', { name: 'Add MOCHI/NVDAx to watchlist' }).click();
    await expect(page.getByRole('button', { name: 'Remove MOCHI/NVDAx from watchlist' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Add WOBBL/NVDAx to watchlist' }).click();
    // The star doesn't open the drawer.
    await expect(page.locator('.drawer.on')).toHaveCount(0);

    await page.reload();
    await page.getByRole('button', { name: 'Watchlist', exact: true }).click();
    await expect(count).toHaveText('2 markets');
    await expect(page.locator('table.ex tbody tr')).toHaveCount(2);
  });

  test('pasting a pool or mint address finds that exact pool', async ({ page }) => {
    await page.goto('/explore');
    await page.getByRole('row', { name: /Open HALO\/SOL/ }).click();
    await expect(page).toHaveURL(/\/pool\//);
    const address = page.url().split('/pool/')[1]!;
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/explore$/);

    const search = page.getByRole('searchbox', { name: 'Search pools' });
    await search.fill(address);
    await expect(page.locator('.count')).toHaveText('1 market');
    await expect(page.locator('table.ex tbody tr').first()).toContainText('HALO/SOL');

    await search.fill('So11111111111111111111111111111111111111113');
    await expect(page.getByText('No pool uses that address yet', { exact: false })).toBeVisible();
  });
});
