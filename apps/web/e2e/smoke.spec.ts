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

test('footer links Oxbow on X, lists Telegram as coming soon, and shows the CA as coming soon', async ({ page }) => {
  await mockApi(page);
  await page.goto('/docs');
  const community = page.locator('footer .fgrid > div').filter({ has: page.getByRole('heading', { name: 'Community' }) });
  await expect(community.getByRole('link', { name: 'X' })).toHaveAttribute('href', 'https://x.com/oxbowflow');
  await expect(community.locator('.fsoon')).toHaveText(['Telegram Soon']);
  await expect(community.locator('.cachip')).toHaveText('CAComing soon');
});

test('the CA is shown as coming soon in the hero and the nav', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await expect(page.locator('.hero .ca.soon')).toContainText('Coming soon');
  // Phones: the hero and footer carry it; the nav has no room.
  if (test.info().project.name === 'mobile') return;
  await expect(page.locator('.nav .cachip.soon')).toBeVisible();
  await expect(page.locator('.nav').getByRole('link', { name: 'Oxbow on X' })).toHaveAttribute('href', 'https://x.com/oxbowflow');
});
