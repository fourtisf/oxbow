import { expect, test } from './fixtures';

test.describe('language', () => {
  test('the footer switch changes the language and remembers it', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.getByRole('button', { name: 'Bahasa Indonesia' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Pilih meme.');
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');
    await expect(page.getByRole('button', { name: 'Bahasa Indonesia' })).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/explore');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Semua pasar berpasangan saham');
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Every stock-paired market');
  });

  test('first visits follow the browser language', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'id-ID' });
    const page = await ctx.newPage();
    await page.goto('/docs');
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Cara kerja Oxbow');
    await ctx.close();
  });
});
