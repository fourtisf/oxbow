import { test as base, expect, type Page } from '@playwright/test';

/** Fails the test on any console error or uncaught page error. */
export const test = base.extend<{ errors: string[] }>({
  errors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await use(errors);
    expect(errors, 'console errors').toEqual([]);
  },
});

export { expect };

/** Ticks the one-time terms confirmation if this browser hasn't accepted it yet. */
export async function acceptTermsIfAsked(page: Page) {
  const box = page.getByRole('dialog', { name: 'Select wallet' }).locator('#termsOk');
  if (await box.isVisible()) await box.check();
}

/** Connects the mock wallet through the "Select wallet" dialog. */
export async function connectWallet(page: Page, name = 'Phantom') {
  await page.getByRole('button', { name: 'Select Wallet' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Select wallet' });
  await expect(dialog).toBeVisible();
  await acceptTermsIfAsked(page);
  await dialog.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByText('Connected ' + name)).toBeVisible();
  await expect(dialog).toBeHidden();
}

/** True when the build under test targets mainnet (NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta), read from the network pill. */
export async function isMainnet(page: Page): Promise<boolean> {
  const label = await page.getByText(/^Solana (mainnet|devnet)$/).first().textContent();
  return label === 'Solana mainnet';
}
