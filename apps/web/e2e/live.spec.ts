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

  test('status page reports real checks', async ({ page }) => {
    await page.goto('/status');
    await expect(page.getByText('Running on sample data', { exact: false })).toHaveCount(0);
  });
});
