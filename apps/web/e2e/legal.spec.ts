import { expect, test } from './fixtures';

const PAGES: [string, string][] = [
  ['/terms', 'Terms of Service'],
  ['/privacy', 'Privacy Policy'],
  ['/risk', 'Risk disclosure'],
  ['/status', 'System status'],
];

for (const [path, heading] of PAGES) {
  test(`${path} renders`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
  });
}

test('the wallet dialog asks for the terms once', async ({ page }) => {
  await page.goto('/explore');
  await page.getByRole('button', { name: 'Select Wallet' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Select wallet' });
  const phantom = dialog.getByRole('button', { name: /Phantom/ });
  await expect(phantom).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  await phantom.click();
  await expect(page.getByText('Connected Phantom')).toBeVisible();

  await page.getByRole('button', { name: /…/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
  await page.getByRole('button', { name: 'Select Wallet' }).first().click();
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  await expect(phantom).toBeEnabled();
});

test('sitemap, robots and share images', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain('/explore</loc>');
  const pool = xml.match(/\/pool\/(\w+)<\/loc>/)?.[1];
  expect(pool).toBeTruthy();

  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /dashboard');
  expect(robots).toContain('Sitemap:');

  for (const path of ['/opengraph-image', `/pool/${pool}/opengraph-image`]) {
    const img = await request.get(path);
    expect(img.status(), path).toBe(200);
    expect(img.headers()['content-type']).toBe('image/png');
  }
});

test.describe('restricted regions', () => {
  // playwright.config.ts starts the server with GEO_BLOCKED_COUNTRIES=XX.
  test.use({ extraHTTPHeaders: { 'cf-ipcountry': 'XX' } });

  test('app pages show the notice; docs and legal pages stay open', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Oxbow is not available in your region');
    await page.goto('/docs');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('How Oxbow works');
    await page.goto('/terms');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Terms of Service');
  });
});
