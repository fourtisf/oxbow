/** The tracker in the browser, against the mocked API (mock-api.ts). */
import { acceptTermsIfAsked, expect, test } from './fixtures';
import { fakePhantom, M, MEME, mockApi, trade, W } from './mock-api';

test.describe('live feed', () => {
  test('home shows trades, hot tokens and top wallets', async ({ page, errors }) => {
    const api = await mockApi(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Follow the wallets');
    const feed = page.locator('.feedcard');
    // Dust is hidden by default: the $10 floor goes to the API.
    await expect(feed.locator('.trow')).toHaveCount(4);
    expect(api.feedQueries.some((q) => q.get('minUsd') === '10')).toBe(true);
    const first = feed.locator('.trow').first();
    await expect(first).toContainText('Alpha');
    await expect(first).toContainText('sold');
    await expect(first).toContainText('MEME');
    await expect(first).toContainText('$600.00');
    await expect(first.getByRole('link', { name: 'View transaction on Solscan' })).toHaveAttribute('href', /^https:\/\/solscan\.io\/tx\//);
    await expect(page.locator('.hotlist li').first()).toContainText('2 buyers');
    await expect(page.locator('.toplist li').first()).toContainText('+$200.00');
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });

  test('before any wallet is tracked, the feed says smart money is being found', async ({ page }) => {
    await mockApi(page, { empty: true });
    await page.goto('/');
    await expect(page.locator('.feedcard')).toContainText('Finding smart money');
    await expect(page.locator('.feedcard')).toContainText('37 traders checked so far · 0 found · Searching now');
  });

  test('a trade from the live stream lands on top', async ({ page }) => {
    await mockApi(page, { live: [trade(99, W.beta, 'BUY', MEME, 1234, 0)] });
    await page.goto('/');
    const first = page.locator('.feedcard .trow').first();
    await expect(first).toContainText('$1,234');
    await expect(first).toHaveClass(/fresh/);
  });

  test('the Following tab asks for follows first, then shows only those wallets', async ({ page }) => {
    const api = await mockApi(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Following' }).click();
    await expect(page.locator('.feedcard')).toContainText('Follow a few wallets');
    await page.goto(`/wallet/${W.beta}`);
    await page.getByRole('button', { name: /^Follow / }).click();
    await page.goto('/');
    await page.getByRole('button', { name: /Following/ }).click();
    await expect(page.locator('.feedcard .trow')).toHaveCount(2);
    expect(api.feedQueries.some((q) => q.get('wallets') === W.beta)).toBe(true);
  });
});

test.describe('wallets', () => {
  test('pasting a wallet tracks it, follows it and opens its page while history loads', async ({ page }) => {
    const api = await mockApi(page);
    await page.goto('/');
    const box = page.getByRole('textbox', { name: 'Wallet address to track' });
    await box.fill('not an address');
    await page.getByRole('button', { name: 'Track' }).click();
    await expect(page.locator('#addw-err')).toHaveText("That isn't a Solana address.");
    await box.fill(W.me);
    await page.getByRole('button', { name: 'Track' }).click();
    await expect(page.locator('#addw-err')).toHaveText("That's a token or program account, not a wallet.");
    await box.fill(W.fresh);
    await page.getByRole('button', { name: 'Track' }).click();
    await expect(page).toHaveURL(`/wallet/${W.fresh}`);
    await expect(page.getByText("Reading this wallet's recent trades")).toBeVisible();
    await expect(page.getByRole('button', { name: /Stop following/ })).toBeVisible();
    expect(api.posts).toContainEqual({ path: '/api/wallets', body: { address: W.fresh } });
  });

  test('the leaderboard lists wallets, featured first', async ({ page }) => {
    await mockApi(page);
    await page.goto('/wallets');
    const rows = page.locator('table.lb tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Alpha');
    await expect(rows.first().locator('.fchip-star')).toBeVisible();
    await expect(rows.nth(1)).toContainText('-$80.00');
  });

  test('a wallet page shows stats, holdings and closed positions; nicknames stay in this browser', async ({ page }) => {
    await mockApi(page);
    await page.goto(`/wallet/${W.alpha}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Alpha');
    await expect(page.locator('.wstat').first()).toContainText('+$200.00');
    await expect(page.locator('.wstat').nth(2)).toContainText('100%');
    await expect(page.locator('section', { hasText: 'Holdings' }).locator('tbody tr')).toContainText(['MEME']);
    await expect(page.locator('section', { hasText: 'Closed positions' }).locator('tbody tr')).toContainText(['RUG']);
    await page.getByRole('button', { name: 'Rename' }).click();
    await page.getByRole('textbox', { name: 'Nickname' }).fill('Whale');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Whale');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Whale');
  });

  test('an untracked wallet can be tracked from its page', async ({ page }) => {
    const api = await mockApi(page);
    await page.goto(`/wallet/${W.fresh}`);
    await expect(page.getByRole('heading', { name: 'Not tracked yet' })).toBeVisible();
    await page.getByRole('button', { name: 'Track this wallet' }).click();
    await expect(page.getByText("Reading this wallet's recent trades")).toBeVisible();
    expect(api.posts.map((p) => p.path)).toContain('/api/wallets');
  });
});

test.describe('tokens', () => {
  test('a token page shows its safety check and the tracked wallets in it', async ({ page }) => {
    await mockApi(page);
    await page.goto(`/token/${M.meme}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('MEME');
    await expect(page.locator('.safety')).toContainText('No red flags');
    await expect(page.locator('section', { hasText: 'Tracked wallets in this token' }).locator('tbody tr')).toContainText(['Alpha']);

    await page.goto(`/token/${M.rug}`);
    await expect(page.locator('.safety')).toContainText('High risk');
    await expect(page.locator('.safety .flags li')).toHaveCount(5);
  });

  test('unknown mints and bad addresses', async ({ page }) => {
    await mockApi(page);
    await page.goto(`/token/${W.fresh}`);
    await expect(page.getByRole('heading', { name: 'Token not found' })).toBeVisible();
    const res = await page.goto('/token/nope');
    expect(res?.status()).toBe(404);
  });
});

test.describe('order flow and smart money', () => {
  test('a token page shows its order flow: pressure, price levels and fills, tracked wallets marked', async ({ page }) => {
    await mockApi(page);
    await page.goto(`/token/${M.meme}`);
    const flow = page.locator('.flow');
    await expect(flow.getByRole('heading', { name: 'Order flow' })).toBeVisible();
    await expect(flow.locator('.press-row')).toContainText('83%');
    await expect(flow.locator('.book tbody tr')).toHaveCount(3);
    await expect(flow.locator('.fills li')).toHaveCount(3);
    await expect(flow.locator('.fills li.tracked')).toHaveCount(1);
    await expect(flow).toContainText('last 3m');
  });

  test('discovered wallets carry the SMART badge in the feed and on the leaderboard', async ({ page }) => {
    await mockApi(page);
    await page.goto('/wallets');
    await expect(page.locator('table.lb tbody tr').nth(1).locator('.smchip')).toHaveText('SMART');
    await expect(page.locator('table.lb tbody tr').first().locator('.smchip')).toHaveCount(0);
    await page.goto('/');
    await expect(page.locator('.feedcard .trow', { hasText: 'RUG' }).locator('.smchip')).toBeVisible();
  });
});

test.describe('limit orders', () => {
  test('place a limit buy at a target price, see it open, cancel it', async ({ page }) => {
    const api = await mockApi(page);
    await fakePhantom(page);
    await page.goto(`/token/${M.meme}`);
    await page.getByRole('button', { name: 'Select Wallet' }).first().click();
    await acceptTermsIfAsked(page);
    await page.getByRole('dialog', { name: 'Select wallet' }).getByRole('button', { name: 'Phantom', exact: true }).click();
    await expect(page.getByText('Connected Phantom')).toBeVisible();
    await page.locator('.tacts').getByRole('button', { name: 'Buy' }).click();
    const panel = page.getByRole('dialog', { name: 'Buy MEME' });
    await panel.getByRole('button', { name: 'Limit' }).click();
    await panel.getByRole('textbox', { name: 'You pay' }).fill('0.5');
    await panel.getByRole('textbox', { name: 'MEME price (USD)' }).fill('0.002');
    // 0.5 SOL at $200 = $100, at $0.002 a token = 50,000 MEME.
    await expect(panel.locator('.tp-quote')).toContainText('50.0K MEME');
    await panel.getByRole('button', { name: 'Place buy order for MEME' }).click();
    await expect(panel.getByRole('heading', { name: 'Order placed' })).toBeVisible();
    expect(api.posts.find((p) => p.path === '/api/limit/create')?.body).toMatchObject({
      wallet: W.me,
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: M.meme,
      makingAmount: '500000000',
      takingAmount: '50000000000',
    });
    await panel.getByRole('button', { name: 'Your open orders' }).click();
    const orders = panel.locator('.orders li');
    await expect(orders).toHaveCount(1);
    await expect(orders).toContainText('Buy 50.0K MEME');
    await orders.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Order cancelled')).toBeVisible();
    await expect(panel.locator('.orders li')).toHaveCount(0);
  });

  test('warns when a buy target is above the market and blocks orders under $5', async ({ page }) => {
    await mockApi(page);
    await fakePhantom(page);
    await page.goto(`/token/${M.meme}`);
    await page.getByRole('button', { name: 'Select Wallet' }).first().click();
    await acceptTermsIfAsked(page);
    await page.getByRole('dialog', { name: 'Select wallet' }).getByRole('button', { name: 'Phantom', exact: true }).click();
    await page.locator('.tacts').getByRole('button', { name: 'Buy' }).click();
    const panel = page.getByRole('dialog', { name: 'Buy MEME' });
    await panel.getByRole('button', { name: 'Limit' }).click();
    await panel.getByRole('textbox', { name: 'MEME price (USD)' }).fill('0.01');
    await expect(panel.locator('.note.warn')).toContainText('Above the current price');
    await panel.getByRole('textbox', { name: 'You pay' }).fill('0.01');
    await expect(panel.getByText('Jupiter needs at least $5 per order.')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Place buy order for MEME' })).toBeDisabled();
  });
});

test.describe('copy trading', () => {
  test('copy a buy: quote with the fee, connect, approve in the wallet, confirmed', async ({ page }) => {
    const api = await mockApi(page);
    await fakePhantom(page);
    await page.goto('/');
    await page.locator('.feedcard .trow').nth(2).getByRole('button', { name: 'Copy this trade: buy MEME' }).click();
    const panel = page.getByRole('dialog', { name: 'Buy MEME' });
    await expect(panel).toContainText('Copying Alpha');
    await panel.getByRole('button', { name: '0.5 SOL' }).click();
    await expect(panel.locator('.tp-quote')).toContainText('Oxbow fee (0.5%)');
    await expect(panel.locator('.tp-quote')).toContainText('0.0025 SOL');
    await panel.getByRole('button', { name: 'Connect wallet' }).click();
    const picker = page.getByRole('dialog', { name: 'Select wallet' });
    await acceptTermsIfAsked(page);
    await picker.getByRole('button', { name: 'Phantom', exact: true }).click();
    await expect(page.getByText('Connected Phantom')).toBeVisible();
    await panel.getByRole('button', { name: 'Buy MEME' }).click();
    await expect(panel.getByRole('heading', { name: 'Bought MEME' })).toBeVisible();
    await expect(panel.getByRole('link', { name: /View on Solscan/ })).toHaveAttribute('href', /^https:\/\/solscan\.io\/tx\//);
    const build = api.posts.find((p) => p.path === '/api/swap/build');
    expect(build?.body).toMatchObject({ inputMint: 'So11111111111111111111111111111111111111112', outputMint: M.meme, amount: '500000000', wallet: W.me, slippageBps: 100 });
  });

  test('selling uses the token balance; a refusal in the wallet is reported', async ({ page }) => {
    await mockApi(page);
    await fakePhantom(page);
    await page.goto(`/token/${M.meme}`);
    await page.getByRole('button', { name: 'Select Wallet' }).first().click();
    await acceptTermsIfAsked(page);
    await page.getByRole('dialog', { name: 'Select wallet' }).getByRole('button', { name: 'Phantom', exact: true }).click();
    await expect(page.getByText('Connected Phantom')).toBeVisible();
    await page.locator('.tacts').getByRole('button', { name: 'Sell' }).click();
    const panel = page.getByRole('dialog', { name: 'Sell MEME' });
    await panel.getByRole('button', { name: '50%' }).click();
    await expect(panel.getByRole('textbox', { name: 'You sell' })).toHaveValue('25000');
    await expect(panel.locator('.tp-quote')).toContainText('0.995 SOL');
    await page.evaluate(() => ((window as unknown as { signMode: string }).signMode = 'reject'));
    await panel.getByRole('button', { name: 'Sell MEME' }).click();
    await expect(panel.getByRole('alert')).toHaveText('Cancelled in your wallet.');
  });

  test('a token that failed the safety check needs an explicit acknowledgement', async ({ page }) => {
    await mockApi(page);
    await fakePhantom(page);
    await page.goto(`/token/${M.rug}`);
    await page.getByRole('button', { name: 'Select Wallet' }).first().click();
    await acceptTermsIfAsked(page);
    await page.getByRole('dialog', { name: 'Select wallet' }).getByRole('button', { name: 'Phantom', exact: true }).click();
    await page.locator('.tacts').getByRole('button', { name: 'Buy' }).click();
    const panel = page.getByRole('dialog', { name: 'Buy RUG' });
    await panel.getByRole('button', { name: '0.1 SOL' }).click();
    const go = panel.getByRole('button', { name: 'Buy RUG' });
    await expect(go).toBeDisabled();
    await panel.getByRole('checkbox').check();
    await expect(go).toBeEnabled();
  });
});

test('following page lists follows with alert switches', async ({ page }) => {
  await mockApi(page);
  await page.goto(`/wallet/${W.alpha}`);
  await page.getByRole('button', { name: /^Follow / }).click();
  await page.goto('/following');
  await expect(page.locator('.flist li')).toHaveCount(1);
  await expect(page.locator('.flist li')).toContainText('Alpha');
  await expect(page.getByRole('switch', { name: /Browser alerts/ })).toHaveAttribute('aria-checked', 'false');
  await page.locator('.flist').getByRole('button', { name: /Remove/ }).click();
  await expect(page.getByText("You aren't following anyone yet.")).toBeVisible();
});
