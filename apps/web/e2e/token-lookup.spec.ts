import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures';

// Any mint that isn't a sample token is read from the chain through /api/token. These
// tests stand in for the chain so they don't depend on a live RPC.
const REAL_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const LOGO_URL = 'https://logos.example/bonk.svg';
const LOGO = readFileSync(join(__dirname, '../public/tokens/mochi.svg'));

const token = {
  mint: REAL_MINT,
  symbol: 'Bonk',
  name: 'Bonk',
  decimals: 5,
  supply: 88_000_000_000_000,
  tokenProgram: 'spl-token',
  mintAuthority: null,
  freezeAuthority: null,
  logoUri: LOGO_URL,
  extensions: [],
  risk: { mintable: false, freezable: false, transferFee: false, transferHook: false, permanentDelegate: false },
  symbolTaken: false,
  createdAt: null,
};

test.describe('token lookup', () => {
  test('a real token shows its own name, ticker and logo', async ({ page }) => {
    await page.route('**/api/token/*', (r) => r.fulfill({ json: token }));
    await page.route(LOGO_URL, (r) => r.fulfill({ body: LOGO, contentType: 'image/svg+xml' }));
    await page.goto('/create');
    await page.getByRole('textbox', { name: 'Token mint address' }).fill(REAL_MINT);
    const card = page.locator('.tcard');
    await expect(card).toContainText('Bonk');
    await expect(card).toContainText('Supply 88,000,000,000,000, 5 decimals');
    const logo = card.locator('img.av');
    await expect(logo).toHaveAttribute('src', LOGO_URL);
    await expect.poll(() => logo.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    await expect(page.getByText('This token has no logo in its metadata', { exact: false })).toHaveCount(0);
    // The preview uses the same logo.
    await expect(page.getByRole('complementary', { name: 'Pool preview' }).locator('img.av').first()).toHaveAttribute('src', LOGO_URL);
  });

  test('a mint that is not on the network says which network was checked', async ({ page }) => {
    await page.route('**/api/token/*', (r) => r.fulfill({ status: 404, json: { error: 'not_found' } }));
    await page.goto('/create');
    await page.getByRole('textbox', { name: 'Token mint address' }).fill(REAL_MINT);
    await expect(page.getByText(/There's no token with that mint on Solana (devnet|mainnet)\./)).toBeVisible();
  });

  test('an RPC failure asks to try again instead of inventing a token', async ({ page }) => {
    await page.route('**/api/token/*', (r) => r.fulfill({ status: 502, json: { error: 'rpc_unavailable' } }));
    await page.goto('/create');
    await page.getByRole('textbox', { name: 'Token mint address' }).fill(REAL_MINT);
    await expect(page.getByText('The token lookup failed', { exact: false })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.tcard')).toHaveCount(0);
  });

  test('a token without a logo in its metadata gets a clear note', async ({ page }) => {
    await page.goto('/create');
    await page.getByRole('textbox', { name: 'Token mint address' }).fill('P1ainTkn5vT9wZpXq2LmNa8bYcDe4FgHjKs7uVwXy');
    await expect(page.locator('.tcard')).toContainText('PLAIN');
    await expect(page.getByText('This token has no logo in its metadata', { exact: false })).toBeVisible();
  });

  test('the lookup endpoint rejects anything that is not a mint address', async ({ request }) => {
    const r = await request.get('/api/token/not-a-mint');
    expect(r.status()).toBe(400);
  });
});
