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

/** Connects the M1 mock wallet through the "Select wallet" dialog. */
export async function connectWallet(page: Page, name = 'Phantom') {
  await page.getByRole('button', { name: 'Select Wallet' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Select wallet' });
  await dialog.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByText('Connected ' + name)).toBeVisible();
  await expect(dialog).toBeHidden();
}
