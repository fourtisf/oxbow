import { connectWallet, expect, test } from './fixtures';

const EXAMPLE_MINT = 'Pebb5Rk3vT9wZpXq2LmNa8bYcDe4FgHjKs7uVwXy';
// The mock lookup keeps mint and freeze authority on mints starting with "Risk".
const RISKY_MINT = 'RiskTkn5vT9wZpXq2LmNa8bYcDe4FgHjKs7uVwXy';
// Derives the ticker LUNE, which a listed pool already uses.
const DUPE_MINT = 'Lune5Rk3vT9wZpXq2LmNa8bYcDe4FgHjKs7uVwXy';

test.describe('create pool (mock wallet)', () => {
  test('validates the mint and explains what is missing', async ({ page }) => {
    await page.goto('/create');
    const hint = page.locator('.pv-hint');
    await expect(page.getByRole('button', { name: 'Select wallet to create' })).toBeEnabled();
    await expect(hint).toHaveText('Add your token to continue.');

    await page.getByRole('textbox', { name: 'Token mint address' }).fill('not-a-mint-0OIl');
    await expect(page.getByText("That isn't a Solana mint address.", { exact: false })).toBeVisible();

    await page.getByRole('textbox', { name: 'Token mint address' }).fill(EXAMPLE_MINT);
    await expect(page.getByText('Looking up the token')).toBeVisible();
    await expect(page.locator('.tcard')).toContainText('PEBL');
    await expect(page.locator('.tcard')).toContainText('MINT AUTHORITY REVOKED');
    await expect(page.locator('.tcard img.av')).toHaveAttribute('src', '/tokens/pebl.png');
    await expect(page.getByText('This token has no logo in its metadata', { exact: false })).toHaveCount(0);
    await expect(hint).toHaveText('Pick a stock or asset to pair with.');

    await page.getByRole('button', { name: /^SOL/ }).click();
    await expect(hint).toHaveText('Enter how much PEBL to deposit.');
    await page.getByRole('textbox', { name: 'Amount of your token' }).fill('2000000000');
    await expect(hint).toHaveText("That's more PEBL than exists. Total supply is 1B.");
  });

  test('creates a pool end to end and lands on it in Explore', async ({ page }) => {
    await page.goto('/create');
    await connectWallet(page);
    await page.getByRole('button', { name: 'Use an example token' }).click();
    await expect(page.locator('.tcard')).toContainText('PEBL');
    await page.getByRole('button', { name: /^NVDAx/ }).click();
    await page.getByRole('button', { name: '50% SUPPLY' }).click();
    await page.getByRole('button', { name: '2 NVDAx' }).click();

    // Preview math: 2 NVDAx * $192.60 * 2 sides = $770.40 liquidity.
    const preview = page.getByRole('complementary', { name: 'Pool preview' });
    await expect(preview).toContainText('$770.40');
    await expect(preview).toContainText('0.28 SOL');

    await page.getByRole('radio', { name: /Lock it for a set time/ }).click();
    await page.getByRole('button', { name: '90 DAYS' }).click();
    const slider = page.getByRole('slider', { name: 'Share of the deposit to lock' });
    await slider.focus();
    for (let i = 0; i < 8; i++) await slider.press('ArrowLeft'); // 100% -> 60% in steps of 5
    await expect(preview.locator('.lp')).toHaveText('60% LOCKED');

    await page.getByRole('button', { name: 'Create pool' }).click();
    const dialog = page.getByRole('dialog', { name: 'Creating pool' });
    await expect(dialog).toContainText('Creating PEBL/NVDAx');
    await expect(dialog).toContainText('Approve in Phantom');
    await expect(dialog).toContainText('Lock 60% of the liquidity');
    // Busy: Escape does not close it.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();

    const done = page.getByRole('dialog', { name: 'Pool created' });
    await expect(done).toContainText('Your pool is live', { timeout: 10_000 });
    await done.getByRole('button', { name: 'View pool' }).click();

    await expect(page).toHaveURL(/\/pool\//);
    const drawer = page.getByRole('dialog', { name: 'Pool details' });
    await expect(drawer).toContainText('PEBL/NVDAx');
    await expect(drawer.locator('.note')).toContainText("40% of this liquidity isn't locked");
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/explore$/);
    await expect(page.locator('table.ex tr.fresh')).toContainText('PEBL/NVDAx');
    await expect(page.locator('.count')).toHaveText('19 markets');
  });

  test('the home card hands mint and stock to the create page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Token' }).fill(EXAMPLE_MINT);
    await page.getByRole('button', { name: /Stock \/ RWA/ }).click();
    await page.getByRole('option', { name: /TSLAx/ }).click();
    await page.getByRole('button', { name: 'Create pair' }).click();
    await expect(page).toHaveURL(/\/create\?mint=Pebb.+&quote=TSLAx/);
    await expect(page.locator('.tcard')).toContainText('PEBL');
    await expect(page.getByRole('button', { name: /^TSLAx/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('"Pair with" links preselect the stock', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Pair with COINx' }).click();
    await expect(page).toHaveURL(/\/create\?quote=COINx/);
    await expect(page.getByRole('button', { name: /^COINx/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('textbox', { name: 'Token mint address' })).toBeFocused();
  });

  test('a token with live authorities needs an explicit acknowledgement', async ({ page }) => {
    await page.goto('/create');
    const hint = page.locator('.pv-hint');
    await page.getByRole('textbox', { name: 'Token mint address' }).fill(RISKY_MINT);
    await expect(page.locator('.tcard')).toContainText('MINT AUTHORITY ACTIVE');
    // No logo in its metadata: the creator is told what buyers will see.
    await expect(page.getByText('This token has no logo in its metadata', { exact: false })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Someone can freeze holders of this token' })).toBeVisible();
    await expect(hint).toHaveText('Confirm you understand the token warnings in step 1.');
    await page.getByRole('checkbox', { name: 'I understand these risks and want to continue' }).check();
    await expect(hint).toHaveText('Pick a stock or asset to pair with.');

    // A new mint resets the acknowledgement.
    await page.getByRole('textbox', { name: 'Token mint address' }).fill(DUPE_MINT);
    await expect(page.getByText('Another token on Oxbow already uses the ticker LUNE.', { exact: false })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /I understand these risks/ })).toHaveCount(0);
    await expect(hint).toHaveText('Pick a stock or asset to pair with.');
  });
});
