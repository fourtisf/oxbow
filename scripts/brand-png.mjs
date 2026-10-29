/**
 * Renders the brand artwork to PNG: app icon sizes (Apple touch icon, 192,
 * 512) and social images (a profile picture that survives a circle crop, and
 * an X/Twitter header). Run after scripts/brand-logo.py (uses apps/web's Playwright):
 *   node scripts/brand-png.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(join(root, 'apps/web/package.json'))('@playwright/test');
const brand = (f) => readFileSync(join(root, 'apps/web/public/brand', f), 'utf8');
// Fonts go in as data URLs: a page set with setContent can't load file:// URLs.
const font = (f) => `data:font/woff2;base64,${readFileSync(join(root, 'apps/web/node_modules/geist/dist/fonts', f)).toString('base64')}`;
const sized = (svg, css) => svg.replace('<svg ', `<svg style="display:block;${css}" `);

const icon = brand('oxbow-icon.svg');
const mark = brand('oxbow-mark.svg');
const logo = brand('oxbow-logo.svg');

const BG =
  'background:#03060C;background-image:radial-gradient(circle at 50% 38%,rgba(110,170,255,.32),rgba(3,6,12,0) 58%),radial-gradient(circle at 85% 100%,rgba(59,123,255,.22),rgba(3,6,12,0) 50%),linear-gradient(180deg,#0B1830,#03060C)';

const page = (w, h, body) => `<html><head><style>
@font-face{font-family:Geist;src:url(${font('geist-sans/Geist-Medium.woff2')});font-weight:500}
@font-face{font-family:GeistMono;src:url(${font('geist-mono/GeistMono-Medium.woff2')});font-weight:500}
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}</style></head><body>${body}</body></html>`;

const OUT = [
  // App icons: the rounded tile on a transparent background.
  ['apps/web/src/app/apple-icon.png', 180, 180, page(180, 180, sized(icon, 'width:180px;height:180px')), true],
  ['apps/web/public/brand/oxbow-icon-192.png', 192, 192, page(192, 192, sized(icon, 'width:192px;height:192px')), true],
  ['apps/web/public/brand/oxbow-icon-512.png', 512, 512, page(512, 512, sized(icon, 'width:512px;height:512px')), true],
  // Profile picture: full-bleed square, mark inside the circle-safe middle.
  [
    'apps/web/public/brand/social/oxbow-profile-1024.png',
    1024,
    1024,
    page(1024, 1024, `<div style="width:1024px;height:1024px;display:grid;place-items:center;${BG}">${sized(mark, 'width:520px;height:520px;filter:drop-shadow(0 30px 60px rgba(59,123,255,.45))')}</div>`),
    false,
  ],
  // X/Twitter header: logo and line in the middle band (the profile picture covers the bottom left).
  [
    'apps/web/public/brand/social/oxbow-x-header-1500x500.png',
    1500,
    500,
    page(
      1500,
      500,
      `<div style="width:1500px;height:500px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;${BG}">
        ${sized(logo, 'height:104px;width:auto')}
        <div style="font:500 34px Geist;color:#A9C4E4;letter-spacing:-.01em">Pick a meme. Pair a stock. Stock-paired pools on Solana.</div>
        <div style="font:500 24px GeistMono;color:#6FB2FF;letter-spacing:.12em">OXBOWFLOW.COM</div>
      </div>`,
    ),
    false,
  ],
];

const browser = await chromium.launch();
for (const [file, w, h, html, transparent] of OUT) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(root, file), omitBackground: transparent });
  await p.close();
  console.log('wrote', file);
}
await browser.close();
