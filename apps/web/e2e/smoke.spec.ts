import { expect, test } from './fixtures';

const ROUTES: [string, RegExp][] = [
  ['/', /Pick a meme/],
  ['/explore', /Every stock-paired market/],
  ['/create', /Build the pair/],
  ['/dashboard', /Your positions/],
  ['/docs', /How Oxbow works/],
];

for (const [path, heading] of ROUTES) {
  test(`${path} renders without console errors`, async ({ page, errors }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
}

for (const path of ['/nope', '/pool/not-an-address', '/pool/So11111111111111111111111111111111111111112']) {
  test(`${path} is a 404`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing here');
  });
}

test('main navigation marks the current page', async ({ page, isMobile }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: isMobile ? 'Main mobile' : 'Main', exact: true });
  await nav.getByRole('link', { name: /Docs/ }).click();
  await expect(page).toHaveURL(/\/docs$/);
  await expect(nav.getByRole('link', { name: /Docs/ })).toHaveAttribute('aria-current', 'page');
});
