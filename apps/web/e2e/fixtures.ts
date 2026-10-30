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
