import { expect, test } from './fixtures';

test.describe('explore', () => {
  test('filters, search and sort', async ({ page }) => {
    await page.goto('/explore');
    const count = page.locator('.count');
    const rows = page.locator('table.ex tbody tr');
    await expect(count).toHaveText('18 markets');

    await page.getByRole('button', { name: 'SOL', exact: true }).click();
    await expect(count).toHaveText('2 markets');
    await expect(rows).toHaveCount(2);
    for (const r of await rows.all()) await expect(r).toContainText('/SOL');

    await page.getByRole('button', { name: 'STOCKS', exact: true }).click();
    await expect(count).toHaveText('15 markets');

    await page.getByRole('button', { name: 'ALL', exact: true }).click();
    await page.getByRole('switch', { name: 'Locked or burned only' }).click();
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    await expect(count).toHaveText('12 markets');
    await expect(page.locator('table.ex .lp.unlocked, table.ex .lp.partial')).toHaveCount(0);
    await page.getByRole('switch').click();

    await page.getByRole('searchbox', { name: 'Search pools' }).fill('mochi');
    await expect(count).toHaveText('1 market');
    await expect(rows.first()).toContainText('MOCHI/NVDAx');

    await page.getByRole('searchbox', { name: 'Search pools' }).fill('zzzz');
    await expect(page.getByText('No markets match.')).toBeVisible();

    await page.getByRole('searchbox', { name: 'Search pools' }).fill('');
    await page.getByRole('combobox', { name: 'Sort pools' }).selectOption('chg');
    await expect(rows.first()).toContainText('MOCHI/NVDAx');
  });

  test('rows open the pool drawer; Escape closes it and restores the URL', async ({ page }) => {
    await page.goto('/explore');
    const row = page.getByRole('row', { name: /Open WOBBL\/NVDAx/ });
    await row.focus();
    await page.keyboard.press('Enter');
    const drawer = page.getByRole('dialog', { name: 'Pool details' });
    await expect(drawer).toBeVisible();
    await expect(page).toHaveURL(/\/pool\/[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    await expect(drawer).toContainText('WOBBL/NVDAx');
    await expect(drawer).toContainText('Who holds the liquidity');
    await expect(drawer.getByRole('button', { name: 'Close' })).toBeFocused();

    await drawer.getByRole('button', { name: '1W' }).click();
    await expect(drawer.getByRole('button', { name: '1W' })).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(row).toBeFocused();
  });

  test('a shared pool link opens as a full page', async ({ page }) => {
    await page.goto('/explore');
    await page.getByRole('row', { name: /Open MOCHI\/NVDAx/ }).click();
    await expect(page).toHaveURL(/\/pool\//);
    const url = page.url();
    await page.goto(url);
    await expect(page.locator('.drawer')).toHaveCount(0);
    await expect(page.locator('.poolpage')).toContainText('MOCHI/NVDAx');
    await expect(page.getByRole('link', { name: 'All markets' })).toBeVisible();
  });
});
