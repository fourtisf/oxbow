import { expect, test } from './fixtures';
import { M, mockApi, W } from './mock-api';

const ROUTES: [string, RegExp][] = [
  ['/', /Follow the wallets/],
  ['/wallets', /Wallets/],
  [`/wallet/${W.alpha}`, /Alpha/],
  [`/token/${M.meme}`, /MEME/],
  ['/following', /Following/],
  ['/docs', /How Oxbow works/],
  ['/status', /System status/],
  ['/terms', /Terms of Service/],
];

for (const [path, heading] of ROUTES) {
  test(`${path} renders without console errors`, async ({ page, errors }) => {
    await mockApi(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
}

for (const path of ['/nope', '/wallet/not-an-address', '/explore', '/pool/So11111111111111111111111111111111111111112']) {
  test(`${path} is a 404`, async ({ page }) => {
    await mockApi(page);
    const res = await page.goto(path);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing here');
  });
}

test('main navigation marks the current page', async ({ page, isMobile }) => {
  await mockApi(page);
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: isMobile ? 'Main mobile' : 'Main', exact: true });
  await expect(nav.getByRole('link', { name: /Feed/ })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('link', { name: /Wallets/ }).click();
  await expect(page).toHaveURL(/\/wallets$/);
  await expect(nav.getByRole('link', { name: /Wallets/ })).toHaveAttribute('aria-current', 'page');
});

test('footer lists X and Telegram as coming soon until their links are set', async ({ page }) => {
  await mockApi(page);
  await page.goto('/docs');
  const community = page.locator('footer .fgrid > div').filter({ has: page.getByRole('heading', { name: 'Community' }) });
  await expect(community.locator('.fsoon')).toHaveText(['X Soon', 'Telegram Soon']);
  await expect(community.getByRole('link')).toHaveCount(0);
});
