import { acceptTermsIfAsked, connectWallet, expect, test } from './fixtures';

test.describe('dashboard (mock wallet)', () => {
  test('asks for a wallet, then lists positions with claim and withdraw', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Select a wallet to see your positions' })).toBeVisible();
    await connectWallet(page);

    const rows = page.locator('.prow:not(.head)');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('MOCHI/NVDAx');
    await expect(page.locator('.dsum')).toContainText('across 3 pools');

    const first = rows.first();
    await first.getByRole('button', { name: 'Claim fees' }).click();
    await expect(page.getByText('Claimed $38.40 in fees')).toBeVisible();
    await expect(first.getByRole('button', { name: 'Claim fees' })).toBeDisabled();

    // Partial withdraw keeps the position.
    await first.getByRole('button', { name: 'Withdraw' }).click();
    const dialog = page.getByRole('dialog', { name: 'Withdraw from MOCHI/NVDAx' });
    await dialog.getByRole('button', { name: '25%' }).click();
    await dialog.getByRole('button', { name: 'Withdraw 25%' }).click();
    await expect(page.getByText('Withdrew 25% of your liquidity from MOCHI/NVDAx')).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(rows).toHaveCount(3);

    // MAX removes it.
    await first.getByRole('button', { name: 'Withdraw' }).click();
    await dialog.getByRole('button', { name: 'Withdraw 100%' }).click();
    await expect(page.getByText('Withdrew your liquidity from MOCHI/NVDAx')).toBeVisible();
    await expect(rows).toHaveCount(2);

    // History lists both withdrawals and the claim, each linked to the explorer.
    const activity = page.locator('.alist li');
    await expect(activity.filter({ hasText: 'Withdrew' })).toHaveCount(2);
    await expect(activity.filter({ hasText: 'Claimed fees' })).toHaveCount(1);
    await expect(activity.first().getByRole('link').first()).toHaveAttribute('href', /solscan\.io\/tx\/.+cluster=devnet/);
  });

  test('shows profit or loss against what was deposited', async ({ page }) => {
    await page.goto('/dashboard');
    await connectWallet(page);
    await expect(page.locator('.dsum4')).toContainText('Profit / loss');
    await expect(page.locator('.prow:not(.head)').first()).toContainText('since deposit');
  });

  test('Manage opens the drawer on the Add liquidity tab, and adding creates a position', async ({ page }) => {
    await page.goto('/dashboard');
    await connectWallet(page);
    await page.locator('.prow:not(.head)').first().getByRole('link', { name: 'Manage' }).click();
    const drawer = page.getByRole('dialog', { name: 'Pool details' });
    await expect(drawer.getByRole('tab', { name: 'Add liquidity' })).toHaveAttribute('aria-selected', 'true');
    await drawer.getByRole('textbox', { name: /Amount of MOCHI/ }).fill('1000');
    await drawer.getByRole('button', { name: 'Add liquidity', exact: true }).click();
    await expect(page.getByText('Added liquidity to MOCHI/NVDAx')).toBeVisible();
  });

  test('swap asks for a wallet first, then checks the balance', async ({ page }) => {
    await page.goto('/explore');
    await page.getByRole('row', { name: /Open MOCHI\/NVDAx/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Pool details' });
    await drawer.getByRole('textbox', { name: 'Amount to pay in NVDAx' }).fill('1');
    await expect(drawer.locator('.tmeta')).toContainText('Price impact');
    await drawer.getByRole('button', { name: 'Select wallet to swap' }).click();
    await acceptTermsIfAsked(page);
    await page.getByRole('dialog', { name: 'Select wallet' }).getByRole('button', { name: /Solflare/ }).click();
    // The submit button follows the Buy / Sell toggle, which uses the same labels.
    const submit = drawer.getByRole('tabpanel').getByRole('button', { name: 'Buy MOCHI', exact: true }).last();
    await expect(submit).not.toHaveAttribute('aria-pressed');
    await drawer.getByRole('textbox', { name: 'Amount to pay in NVDAx' }).fill('500');
    await submit.click();
    await expect(page.getByText('You only have 18.4 NVDAx')).toBeVisible();
  });
});
