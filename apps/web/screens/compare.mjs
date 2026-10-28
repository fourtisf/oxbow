/**
 * Side-by-side screenshots of the prototype (design/oxbow.html) and the app
 * at 1920, 1440 and 390px, for M1 visual review.
 *
 *   APP_URL=http://localhost:3000 pnpm screens
 *
 * For a like-for-like hero, build the app with the prototype's sample CA and
 * mainnet label (see screens/README.md). Writes screens/out/index.html.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'out');
const PROTO = pathToFileURL(resolve(here, '../../../design/oxbow.html')).href;
const APP = process.env.APP_URL ?? 'http://localhost:3000';
const WIDTHS = (process.env.WIDTHS ?? '1920,1440,390').split(',').map(Number);
const ONLY = process.env.ONLY?.split(',');

const settle = async (page) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
};

const connectWallet = async (page) => {
  await page.getByRole('button', { name: 'Select Wallet' }).first().click();
  // The app asks for the terms once per browser; the prototype doesn't.
  const terms = page.locator('#termsOk');
  if (await terms.isVisible().catch(() => false)) await terms.check();
  await page.getByRole('button', { name: /Phantom/ }).click();
  await page.waitForTimeout(1300);
};

/** Each scenario drives the prototype (hash routes) and the app (real routes) to the same state. */
const SCENARIOS = [
  { name: 'home', proto: (p) => p.goto(PROTO + '#home'), app: (p) => p.goto(APP + '/') },
  { name: 'explore', proto: (p) => p.goto(PROTO + '#explore'), app: (p) => p.goto(APP + '/explore') },
  { name: 'create', proto: (p) => p.goto(PROTO + '#create'), app: (p) => p.goto(APP + '/create') },
  { name: 'dashboard', proto: (p) => p.goto(PROTO + '#dashboard'), app: (p) => p.goto(APP + '/dashboard') },
  { name: 'docs', proto: (p) => p.goto(PROTO + '#docs'), app: (p) => p.goto(APP + '/docs') },
  {
    name: 'drawer',
    full: false,
    proto: async (p) => {
      await p.goto(PROTO + '#explore');
      await p.locator('#rows tr').first().click();
      await p.waitForTimeout(500);
    },
    app: async (p) => {
      await p.goto(APP + '/explore');
      await p.locator('table.ex tbody tr').first().click();
      await p.waitForSelector('.drawer.on');
      await p.waitForTimeout(500);
    },
  },
  {
    name: 'create-filled',
    proto: async (p) => {
      await p.goto(PROTO + '#create');
      await connectWallet(p);
      await p.click('#useExample');
      await p.waitForTimeout(900);
      await p.click('.qtile[data-q="NVDAx"]');
      await p.click('[data-bpct="50"]');
      await p.click('[data-qv="2"]');
      await p.click('[data-lock="lock"]');
    },
    app: async (p) => {
      await p.goto(APP + '/create');
      await connectWallet(p);
      await p.getByRole('button', { name: 'Use an example token' }).click();
      await p.waitForSelector('.tcard');
      await p.getByRole('button', { name: /^NVDAx/ }).click();
      await p.getByRole('button', { name: '50% SUPPLY' }).click();
      await p.getByRole('button', { name: '2 NVDAx' }).click();
      await p.getByRole('radio', { name: /Lock it for a set time/ }).click();
    },
  },
  {
    name: 'dashboard-connected',
    proto: async (p) => {
      await p.goto(PROTO + '#dashboard');
      await connectWallet(p);
    },
    app: async (p) => {
      await p.goto(APP + '/dashboard');
      await connectWallet(p);
    },
  },
];

const browser = await chromium.launch();
const rows = [];
for (const w of WIDTHS) {
  await mkdir(join(OUT, String(w)), { recursive: true });
  for (const s of SCENARIOS) {
    if (ONLY && !ONLY.includes(s.name)) continue;
    for (const side of ['proto', 'app']) {
      const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : 1000 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      try {
        await s[side](page);
        await settle(page);
        await page.screenshot({ path: join(OUT, String(w), `${s.name}-${side}.png`), fullPage: s.full !== false });
      } catch (e) {
        errors.push('SCENARIO FAILED: ' + e.message.split('\n')[0]);
      }
      if (errors.length) console.log(`[${w}] ${s.name} ${side}:`, errors.join(' | '));
      await ctx.close();
    }
    rows.push(`<h2>${s.name} @ ${w}px</h2><div class="pair"><figure><figcaption>Prototype</figcaption><img src="${w}/${s.name}-proto.png"></figure><figure><figcaption>App</figcaption><img src="${w}/${s.name}-app.png"></figure></div>`);
    console.log(`[${w}] ${s.name} done`);
  }
}
await browser.close();
await writeFile(
  join(OUT, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Oxbow M1 screenshots</title><style>body{background:#111;color:#eee;font:14px system-ui;margin:24px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}figure{margin:0}img{width:100%;border:1px solid #333}h2{margin:32px 0 8px}</style>${rows.join('')}`,
);
console.log('Wrote', join(OUT, 'index.html'));
