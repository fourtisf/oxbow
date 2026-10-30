import { expect, test } from './fixtures';
import { mockApi } from './mock-api';

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
  await mockApi(page);
  await page.addInitScript(() => {
    // An installed Phantom, so connecting works without the extension.
    const acct = { address: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', publicKey: new Uint8Array(32), chains: ['solana:mainnet'], features: [] };
    const wallet = {
      version: '1.0.0',
      name: 'Phantom',
      icon: 'data:image/svg+xml;base64,PHN2Zy8+',
      chains: ['solana:mainnet'],
      accounts: [] as unknown[],
      features: { 'standard:connect': { version: '1.0.0', connect: async () => ({ accounts: [acct] }) }, 'standard:events': { version: '1.0.0', on: () => () => {} } },
    };
    window.addEventListener('wallet-standard:app-ready', (e) => (e as CustomEvent).detail.register(wallet));
  });
  await page.goto('/wallets');
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
  expect(xml).toContain('/wallets</loc>');
  expect(xml).toContain('/docs</loc>');

  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /following');
  expect(robots).toContain('Sitemap:');

  const img = await request.get('/opengraph-image');
  expect(img.status()).toBe(200);
  expect(img.headers()['content-type']).toBe('image/png');
});

test.describe('restricted regions', () => {
  // playwright.config.ts starts the server with GEO_BLOCKED_COUNTRIES=XX.
  test.use({ extraHTTPHeaders: { 'cf-ipcountry': 'XX' } });

  test('app pages show the notice; docs and legal pages stay open', async ({ page }) => {
    await page.goto('/wallets');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Oxbow is not available in your region');
    await page.goto('/docs');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('How Oxbow works');
    await page.goto('/terms');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Terms of Service');
  });
});

test('brand icons and the web manifest are served', async ({ page, request }) => {
  const files: [string, string][] = [
    ['/icon.svg', 'image/svg+xml'],
    ['/apple-icon.png', 'image/png'],
    ['/brand/oxbow-icon-512.png', 'image/png'],
  ];
  for (const [path, type] of files) {
    const r = await request.get(path);
    expect(r.status(), path).toBe(200);
    expect(r.headers()['content-type'], path).toContain(type);
  }
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe('Oxbow');
  expect(manifest.icons.map((i: { src: string }) => i.src)).toContain('/brand/oxbow-icon-512.png');

  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});
