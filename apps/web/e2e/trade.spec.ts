import { connectWallet, expect, isMainnet, isSampleData, outboundUrl, test } from './fixtures';

async function openMochi(page: import('@playwright/test').Page) {
  await page.goto('/explore');
  await connectWallet(page);
  await page.getByRole('row', { name: /Open MOCHI\/NVDAx/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Pool details' });
  await expect(drawer).toContainText('MOCHI/NVDAx');
  return drawer;
}

test.describe('trading (mock wallet)', () => {
  test('buys, then sells back, with balances and history updating', async ({ page }) => {
    const drawer = await openMochi(page);
    const panel = drawer.getByRole('tabpanel');
    const submit = (label: string) => panel.getByRole('button', { name: label, exact: true }).last();

    await panel.getByRole('textbox', { name: 'Amount to pay in NVDAx' }).fill('2');
    await expect(drawer.locator('.tmeta')).toContainText('Minimum received');
    await submit('Buy MOCHI').click();
    await expect(page.getByText(/^Swapped 2 NVDAx for [\d.,]+[KM]? MOCHI$/)).toBeVisible();
    await expect(panel).toContainText('Balance: 16.4 NVDAx');

    await panel.getByRole('button', { name: 'Sell MOCHI', exact: true }).first().click();
    await expect(panel.getByRole('button', { name: 'Sell MOCHI', exact: true }).first()).toHaveAttribute('aria-pressed', 'true');
    await panel.getByRole('button', { name: 'MAX' }).click();
    await expect(panel.getByRole('textbox', { name: 'Amount to pay in MOCHI' })).not.toHaveValue('');
    await submit('Sell MOCHI').click();
    await expect(page.getByText(/^Swapped [\d.,]+[KM]? MOCHI for [\d.,]+ NVDAx$/)).toBeVisible();
    await expect(panel).toContainText('Balance: 0 MOCHI');

    // Client-side navigation: the mock wallet's history lives in this page's memory.
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/explore$/);
    await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: /Dashboard/ }).click();
    await expect(page.locator('.alist li').filter({ hasText: 'Swapped' })).toHaveCount(2);
  });

  test('slippage settings change the minimum received and warn when high', async ({ page }) => {
    const drawer = await openMochi(page);
    await drawer.getByRole('textbox', { name: 'Amount to pay in NVDAx' }).fill('1');
    const minRow = drawer.locator('.tmeta div', { hasText: 'Minimum received' });
    await expect(minRow).toContainText('(1%)');

    await drawer.getByRole('button', { name: 'Slippage tolerance' }).click();
    await drawer.getByRole('group', { name: 'Slippage tolerance' }).getByRole('button', { name: '0.5%' }).click();
    await expect(minRow).toContainText('(0.5%)');

    await drawer.getByRole('textbox', { name: 'Custom slippage, percent' }).fill('12');
    await expect(minRow).toContainText('(12%)');
    await expect(drawer.getByText('High slippage: you may get a much worse price.')).toBeVisible();
  });

  test('chart switches to candles; trades and explorer links are listed', async ({ page }) => {
    await page.goto('/explore');
    await page.getByRole('row', { name: /Open MOCHI\/NVDAx/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Pool details' });
    await drawer.getByRole('button', { name: 'Candles' }).click();
    await expect(drawer.getByRole('button', { name: 'Candles' })).toHaveAttribute('aria-pressed', 'true');
    await expect(drawer.locator('svg .cnd').first()).toBeVisible();

    await expect(drawer.locator('.ttable tbody tr')).toHaveCount(12);
    // Solscan points at the build's network; market-data sites only list mainnet pools.
    // On sample data the links are shown disabled, since the addresses don't exist.
    const mainnet = await isMainnet(page);
    const sample = await isSampleData(page);
    const ext = (name: string) => drawer.locator('.links .xlink', { hasText: name });
    expect(await outboundUrl(ext('Solscan · Pool'))).toMatch(new RegExp(`^https://solscan\\.io/account/\\w+${mainnet ? '' : '\\?cluster=devnet'}$`));
    if (sample) {
      await expect(ext('Solscan · Pool')).toHaveAttribute('aria-disabled', 'true');
      await expect(drawer.getByText('These are sample addresses', { exact: false })).toBeVisible();
    }
    if (mainnet) {
      expect(await outboundUrl(ext('DexScreener'))).toMatch(/^https:\/\/dexscreener\.com\/solana\/\w+$/);
      expect(await outboundUrl(ext('Birdeye'))).toMatch(/^https:\/\/birdeye\.so\/token\/\w+\?chain=solana$/);
    } else {
      await expect(drawer.locator('.links .xlink', { hasText: /DexScreener|Birdeye/ })).toHaveCount(0);
    }
  });
});
