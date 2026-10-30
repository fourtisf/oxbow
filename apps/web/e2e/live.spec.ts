/**
 * Live-data mode: the app reads the Oxbow API. Run against a build made with
 * NEXT_PUBLIC_LIVE_DATA=1 and an API serving the test fixtures
 * (apps/api: e2e:fixtures), with E2E_LIVE=1. See apps/web/README "Live e2e".
 */
import type { Page } from '@playwright/test';
import { shortAddr } from '@oxbow/shared';
import { acceptTermsIfAsked, expect, test } from './fixtures';

// Random keys made for this test; no wallet holds them.
const ADDR = 'D7eBunak7CEatz4zjjHddr34worubamHYJvKGSwrRg7V';
const ADDR2 = 'HDWjMLuRAg1Cvze7D5dUzkDutPRHa8VKTdTBkwNw5rJ6';

/** A Wallet Standard wallet named Phantom: approves connects, remembers approval for silent reconnects, and can switch accounts. */
async function fakePhantom(page: Page) {
  await page.addInitScript(
    ([addr, addr2]) => {
      const acct = (address: string) => ({ address, publicKey: new Uint8Array(32), chains: ['solana:mainnet'], features: [] });
      const listeners: ((p: { accounts: unknown[] }) => void)[] = [];
      const wallet = {
        version: '1.0.0',
        name: 'Phantom',
        icon: 'data:image/svg+xml;base64,PHN2Zy8+',
        chains: ['solana:mainnet'],
        accounts: [] as unknown[],
        features: {
          // Signs and "sends": counts calls; window.signMode = 'reject' refuses like a user would.
          'solana:signAndSendTransaction': {
            version: '1.0.0',
            supportedTransactionVersions: [0],
            signAndSendTransaction: async () => {
              const w = window as unknown as { signs: number; signMode?: string };
              w.signs = (w.signs ?? 0) + 1;
              if (w.signMode === 'reject') throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
              return [{ signature: new Uint8Array(64).fill(w.signs) }];
            },
          },
          'standard:connect': {
            version: '1.0.0',
            connect: async (input?: { silent?: boolean }) => {
              if (input?.silent && localStorage.getItem('fake_ok') !== '1') return { accounts: [] };
              localStorage.setItem('fake_ok', '1');
              wallet.accounts = [acct(addr!)];
              return { accounts: wallet.accounts };
            },
          },
          'standard:disconnect': {
            version: '1.0.0',
            disconnect: async () => {
              localStorage.removeItem('fake_ok');
              wallet.accounts = [];
            },
          },
          'standard:events': {
            version: '1.0.0',
            on: (_e: string, l: (p: { accounts: unknown[] }) => void) => {
              listeners.push(l);
              return () => {};
            },
          },
        },
      };
      (window as unknown as { switchAccount: () => void }).switchAccount = () => listeners.forEach((l) => l({ accounts: [acct(addr2!)] }));
      window.addEventListener('wallet-standard:app-ready', (e) => (e as CustomEvent).detail.register(wallet));
    },
    [ADDR, ADDR2],
  );
}

async function pickWallet(page: Page, name: string) {
  await page.getByRole('button', { name: 'Select Wallet' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Select wallet' });
  await expect(dialog).toBeVisible();
  await acceptTermsIfAsked(page);
  await dialog.getByRole('button', { name, exact: true }).click();
  return dialog;
}

test.describe('live data', () => {
  test('home reads the API: no sample banner or footer note, stocks in the ticker', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.samplebar')).toHaveCount(0);
    await expect(page.locator('footer')).not.toContainText('sample data');
    const ticker = page.getByRole('marquee', { name: 'Live prices' });
    await expect(ticker).toContainText('TSLAx');
    await expect(ticker).toContainText('BONK');
  });

  test('explore lists the API’s pools and filters them', async ({ page }) => {
    await page.goto('/explore');
    const count = page.locator('.count');
    await expect(count).toHaveText('3 markets');
    await expect(page.locator('table.ex tbody tr').first()).toContainText('BONK/TSLAx');
    await page.getByRole('button', { name: 'SOL', exact: true }).click();
    await expect(count).toHaveText('1 market');
    await expect(page.locator('table.ex tbody tr')).toContainText(['WIF/SOL']);
  });

  test('connects a real (Wallet Standard) wallet read-only, follows account switches and reconnects silently', async ({ page }) => {
    await fakePhantom(page);
    await page.goto('/explore');
    const dialog = await pickWallet(page, 'Phantom');
    await expect(page.getByText('Connected Phantom')).toBeVisible();
    await expect(dialog).toBeHidden();
    const header = page.getByRole('banner');
    await expect(header).toContainText(shortAddr(ADDR));

    await page.evaluate(() => (window as unknown as { switchAccount: () => void }).switchAccount());
    await expect(header).toContainText(shortAddr(ADDR2));

    // A reload restores the session without a prompt.
    await page.reload();
    await expect(header).toContainText(shortAddr(ADDR));

    await header.getByRole('button', { name: shortAddr(ADDR) }).click();
    await page.getByRole('button', { name: 'Disconnect' }).click();
    await expect(page.getByRole('button', { name: 'Select Wallet' }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Select Wallet' }).first()).toBeVisible();
  });

  test('explains missing and hardware wallets instead of faking a connection', async ({ page }) => {
    await page.goto('/explore');
    const dialog = await pickWallet(page, 'Solflare');
    await expect(dialog.getByText('Connecting shares only your public address.', { exact: false })).toBeVisible();
    await expect(page.getByText("Solflare isn't installed in this browser.", { exact: false })).toBeVisible();
    await dialog.getByRole('button', { name: 'Ledger', exact: true }).click();
    await expect(page.getByText('For now, connect your Ledger through Phantom or Solflare.')).toBeVisible();
    await expect(page.getByRole('banner')).not.toContainText('…');
  });

  test('trading and pool creation say they open soon instead of failing', async ({ page }) => {
    await fakePhantom(page);
    await page.goto('/explore');
    await page.getByRole('row', { name: /Open BONK\/TSLAx/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Pool details' });
    await expect(drawer).toContainText('BONK/TSLAx');
    await expect(drawer.getByRole('button', { name: 'Select wallet to swap' })).toBeVisible();
    await page.keyboard.press('Escape');

    await pickWallet(page, 'Phantom');
    await expect(page.getByText('Connected Phantom')).toBeVisible();
    await page.getByRole('row', { name: /Open BONK\/TSLAx/ }).click();
    await expect(drawer.getByRole('button', { name: 'Trading opens soon' })).toBeDisabled();
    await page.keyboard.press('Escape');

    // A fresh page load: the wallet reconnects silently.
    await page.goto('/create');
    await expect(page.getByRole('banner')).toContainText(shortAddr(ADDR));
    // Pairable stocks come from the API; there is no made-up example mint.
    await expect(page.locator('.create')).toContainText('TSLAx');
    await expect(page.locator('.create')).toContainText('NVDAx');
    await expect(page.getByRole('button', { name: /example/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pool creation opens soon' })).toBeDisabled();
  });

  test('creates a pool through the wallet: checks, approval, listing, LP burn (chain answers mocked)', async ({ page, request }) => {
    await fakePhantom(page);
    // A listed pool stands in for the one the chain would create.
    const listed = (await (await request.get('/api/pools')).json()) as { items: { address: string }[] };
    const poolAddr = listed.items[0]!.address;
    const detail = await (await request.get(`/api/pools/${poolAddr}`)).json();
    const meme = ADDR2;
    const calls: string[] = [];
    await page.route('**/api/venues', (r) =>
      r.fulfill({ json: { createEnabled: true, oxbowFeeLamports: 100_000_000, venues: [{ id: 'RAYDIUM_CPMM', enabled: true, feeTiers: [{ feeBps: 25, createPoolFeeLamports: 150_000_000 }, { feeBps: 100, createPoolFeeLamports: 150_000_000 }] }, { id: 'METEORA_DAMM_V2', enabled: false, feeTiers: [] }, { id: 'ORCA_WHIRLPOOL', enabled: false, feeTiers: [] }] } }),
    );
    await page.route(`**/api/tokens/${meme}`, (r) =>
      r.fulfill({ json: { mint: meme, symbol: 'MEME', name: 'Meme Coin', decimals: 6, supply: 1_000_000_000, tokenProgram: 'spl-token', mintAuthority: null, freezeAuthority: null, logoUri: null, extensions: [], risk: { mintable: false, freezable: false, transferFee: false, transferHook: false, permanentDelegate: false }, symbolTaken: false, createdAt: null } }),
    );
    await page.route('**/api/wallet/*/balances*', (r) => {
      const mints = new URL(r.request().url()).searchParams.get('mints')!.split(',');
      return r.fulfill({ json: Object.fromEntries(mints.map((m) => [m, 1_000_000_000])) });
    });
    await page.route('**/api/pools/build', (r) => {
      calls.push('build:' + (r.request().postDataJSON() as { feeBps: number; venue: string }).feeBps);
      return r.fulfill({ json: { transaction: 'AAAA', pool: poolAddr } });
    });
    await page.route('**/api/tx/*', (r) => r.fulfill({ json: { status: 'confirmed' } }));
    await page.route('**/api/pools/register', (r) => {
      calls.push('register');
      return r.fulfill({ json: detail });
    });
    await page.route(`**/api/pools/${poolAddr}/burn`, (r) => {
      calls.push('burn');
      return r.fulfill({ json: { transaction: 'AAAA', pool: poolAddr } });
    });
    await page.route(`**/api/pools/${poolAddr}/lock`, (r) => {
      calls.push('lock');
      return r.fulfill({ json: detail });
    });

    await page.goto('/create');
    await pickWallet(page, 'Phantom');
    await expect(page.getByText('Connected Phantom')).toBeVisible();
    await page.getByRole('textbox', { name: 'Token mint address' }).fill(meme);
    await expect(page.locator('.tcard')).toContainText('MEME');
    await page.getByRole('button', { name: /^TSLAx/ }).click();
    await page.getByRole('button', { name: '50% SUPPLY' }).click();
    await page.getByRole('button', { name: /^1 TSLAx$/ }).click();
    // Meteora and Orca are not open yet; neither are timed locks.
    await expect(page.getByRole('button', { name: /Meteora DAMM v2/ })).toBeDisabled();
    await expect(page.getByRole('radio', { name: /Lock it for a set time/ })).toBeDisabled();

    // First try: the creator cancels in the wallet.
    await page.evaluate(() => ((window as unknown as { signMode: string }).signMode = 'reject'));
    await page.getByRole('button', { name: 'Create pool' }).click();
    await expect(page.getByText('Cancelled in your wallet. Nothing was sent.')).toBeVisible();

    await page.evaluate(() => ((window as unknown as { signMode: string }).signMode = 'ok'));
    await page.getByRole('button', { name: 'Create pool' }).click();
    const done = page.getByRole('dialog', { name: 'Pool created' });
    await expect(done).toContainText('Your pool is live', { timeout: 15_000 });
    expect(calls).toEqual(['build:100', 'build:100', 'register', 'burn', 'lock']);
    // Create, then the LP burn: two approvals (plus the cancelled one).
    expect(await page.evaluate(() => (window as unknown as { signs: number }).signs)).toBe(3);
  });

  test('offers popular tokens as quick picks in create step 1', async ({ page }) => {
    await page.route('**/api/tokens/popular', (r) =>
      r.fulfill({ json: [{ mint: ADDR, symbol: 'BONK', name: 'Bonk', logoUri: null }, { mint: ADDR2, symbol: 'WIF', name: 'dogwifhat', logoUri: null }] }),
    );
    await page.route(`**/api/tokens/${ADDR2}`, (r) =>
      r.fulfill({ json: { mint: ADDR2, symbol: 'WIF', name: 'dogwifhat', decimals: 6, supply: 998_900_000, tokenProgram: 'spl-token', mintAuthority: null, freezeAuthority: null, logoUri: null, extensions: [], risk: { mintable: false, freezable: false, transferFee: false, transferHook: false, permanentDelegate: false }, symbolTaken: false, createdAt: null } }),
    );
    await page.goto('/create');
    const picks = page.getByRole('group', { name: 'Popular on Solana' });
    await expect(picks.getByRole('button')).toHaveText(['BONK', 'WIF']);
    await picks.getByRole('button', { name: 'WIF' }).click();
    await expect(page.getByRole('textbox', { name: 'Token mint address' })).toHaveValue(ADDR2);
    await expect(page.locator('.tcard')).toContainText('dogwifhat');
    // The picks step aside once a token is chosen.
    await expect(picks).toHaveCount(0);
  });

  test('status page reports real checks', async ({ page }) => {
    await page.goto('/status');
    await expect(page.getByText('Running on sample data', { exact: false })).toHaveCount(0);
  });
});
