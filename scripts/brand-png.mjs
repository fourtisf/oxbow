/**
 * Renders the brand icon to the PNG sizes browsers and app launchers ask for.
 * Run after scripts/brand-logo.py (uses apps/web's Playwright):
 *   node scripts/brand-png.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(join(root, 'apps/web/package.json'))('@playwright/test');
const svg = readFileSync(join(root, 'apps/web/public/brand/oxbow-icon.svg'), 'utf8');
const OUT = [
  ['apps/web/src/app/apple-icon.png', 180],
  ['apps/web/public/brand/oxbow-icon-192.png', 192],
  ['apps/web/public/brand/oxbow-icon-512.png', 512],
];

const browser = await chromium.launch();
for (const [file, size] of OUT) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg style="display:block;width:${size}px;height:${size}px" `)}</body></html>`);
  await page.screenshot({ path: join(root, file), omitBackground: true });
  await page.close();
  console.log('wrote', file);
}
await browser.close();
