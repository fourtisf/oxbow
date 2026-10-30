/**
 * Renders the brand artwork to PNG: app icon sizes (Apple touch icon, 192,
 * 512) and social images (a profile picture that survives a circle crop, for
 * X and Telegram; an X header; "coming soon" announcement cards for posts).
 * Run after scripts/brand-logo.py (uses apps/web's Playwright):
 *   node scripts/brand-png.mjs [filter]
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
@font-face{font-family:Geist;src:url(${font('geist-sans/Geist-SemiBold.woff2')});font-weight:600}
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
        <div style="font:500 34px Geist;color:#A9C4E4;letter-spacing:-.01em">Follow smart money on Solana. Copy any trade in one tap.</div>
        <div style="font:500 24px GeistMono;color:#6FB2FF;letter-spacing:.12em">OXBOWFLOW.COM</div>
      </div>`,
    ),
    false,
  ],
  // Announcement cards (X posts, Telegram pinned message): 16:9 and square.
  ['apps/web/public/brand/social/oxbow-coming-soon-1600x900.png', 1600, 900, page(1600, 900, announce(1600, 900)), false],
  ['apps/web/public/brand/social/oxbow-coming-soon-1080.png', 1080, 1080, page(1080, 1080, announce(1080, 1080)), false],
];

/** "Coming soon" card: logo, the hero line, what Oxbow is, and the official site. */
function announce(w, h) {
  const square = w === h;
  const head = square ? 116 : 128;
  return `<div style="position:relative;width:${w}px;height:${h}px;overflow:hidden;${BG};font-family:Geist;color:#F1F6FF">
    <div style="position:absolute;right:${square ? -170 : -210}px;top:${square ? -150 : 170}px;opacity:.16">${sized(mark, `width:${square ? 580 : 690}px;height:${square ? 580 : 690}px`)}</div>
    <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:64px 64px;mask-image:radial-gradient(circle at 30% 40%,#000,transparent 75%)"></div>
    <div style="position:relative;height:100%;box-sizing:border-box;padding:${square ? '84px 80px' : '88px 104px'};display:flex;flex-direction:column">
      ${sized(logo, 'height:64px;width:auto;align-self:flex-start')}
      <div style="margin-top:auto">
        <div style="display:inline-flex;align-items:center;gap:14px;padding:12px 22px;border-radius:999px;background:rgba(111,178,255,.1);box-shadow:inset 0 0 0 1.5px rgba(111,178,255,.35);font:500 22px GeistMono;letter-spacing:.2em;color:#9ECFFF">
          <span style="width:12px;height:12px;border-radius:50%;background:#3DDC97;box-shadow:0 0 18px #3DDC97"></span>COMING SOON
        </div>
        <div style="margin:34px 0 26px;font:600 ${head}px/.98 Geist;letter-spacing:-.045em">Follow the wallets<br><span style="background:linear-gradient(92deg,#E4F2FF 0%,#9ECFFF 45%,#6FB2FF 100%);-webkit-background-clip:text;background-clip:text;color:transparent">that move first.</span></div>
        <div style="font:500 ${square ? 32 : 34}px/1.35 Geist;color:#A9B8CB;max-width:${square ? 860 : 980}px">Every buy and sell from top Solana wallets, seconds after it lands. Copy any trade in one tap from your own wallet.</div>
      </div>
      <div style="margin-top:${square ? 56 : 64}px;display:flex;justify-content:space-between;align-items:center;font:500 24px GeistMono;letter-spacing:.14em;color:#6FB2FF">
        <span>OXBOWFLOW.COM</span><span style="color:#6B7C92">BUILT ON SOLANA</span>
      </div>
    </div>
  </div>`;
}

// Optional filter: `node scripts/brand-png.mjs coming-soon` renders only matching files.
const only = process.argv[2];
const browser = await chromium.launch();
for (const [file, w, h, html, transparent] of OUT.filter(([f]) => !only || f.includes(only))) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(root, file), omitBackground: transparent });
  await p.close();
  console.log('wrote', file);
}
await browser.close();
