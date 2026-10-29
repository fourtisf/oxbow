import { expect, test } from './fixtures';

async function openPicker(page: import('@playwright/test').Page) {
  await page.goto('/explore');
  await page.getByRole('button', { name: 'Select Wallet' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Select wallet' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('wallet picker', () => {
  test('lists the wallets with their logos, and install links for missing ones', async ({ page }) => {
    const dialog = await openPicker(page);
    const rows = dialog.locator('.witem');
    await expect(rows).toHaveCount(13);
    for (const name of ['Phantom', 'Solflare', 'Backpack', 'Bitget Wallet', 'OKX Wallet', 'Coinbase Wallet', 'Trust Wallet', 'Ledger']) {
      await expect(dialog.getByRole('button', { name, exact: true })).toBeVisible();
    }
    const logos = dialog.locator('.wlogo img');
    for (const img of await logos.all()) await img.scrollIntoViewIfNeeded();
    await expect.poll(() => logos.evaluateAll((imgs) => (imgs as HTMLImageElement[]).filter((i) => i.complete && i.naturalWidth > 0).length)).toBe(13);
    // Nothing is installed in the test browser: no false "Detected".
    await expect(dialog.locator('.wstate', { hasText: 'Detected' })).toHaveCount(0);
    await expect(dialog.getByRole('link', { name: 'Install Bitget Wallet (opens its site)' })).toHaveAttribute('href', 'https://web3.bitget.com');
    await expect(dialog.getByText('Demo: picking a wallet connects a simulated one.', { exact: false })).toBeVisible();
  });

  test('detects injected and Wallet Standard wallets and lists them first', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { bitkeep: unknown }).bitkeep = { solana: {} };
      // A Wallet Standard wallet answering the app's "app-ready" event.
      window.addEventListener('wallet-standard:app-ready', (e) => (e as CustomEvent).detail.register({ name: 'OKX Wallet' }));
    });
    const dialog = await openPicker(page);
    const rows = dialog.locator('.witem');
    await expect(rows.nth(0)).toContainText('Bitget Wallet');
    await expect(rows.nth(0)).toContainText('Detected');
    await expect(rows.nth(1)).toContainText('OKX Wallet');
    await expect(rows.nth(1)).toContainText('Detected');
    await expect(dialog.locator('.wstate', { hasText: 'Detected' })).toHaveCount(2);
  });
});
