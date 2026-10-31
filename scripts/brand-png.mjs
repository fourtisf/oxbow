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

const MARK_D = 'M106 64A42 42 0 1 1 22 64A42 42 0 1 1 106 64ZM97 56A25 25 0 1 0 47 56A25 25 0 1 0 97 56Z';
/** Film grain, so big gradients don't band. */
const grain = (w, h, o = 0.06) =>
  `<svg width="${w}" height="${h}" style="position:absolute;inset:0;opacity:${o};mix-blend-mode:overlay"><filter id="gr"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#gr)"/></svg>`;
/** The mark with a glassy top light and a bright rim. */
const glossyMark = (size, css = '') => `<svg viewBox="22 22 84 84" width="${size}" height="${size}" style="display:block;overflow:visible;${css}">
  <defs>
    <linearGradient id="gm" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2FAFF"/><stop offset=".42" stop-color="#93CEFF"/><stop offset="1" stop-color="#2F6BFF"/></linearGradient>
    <linearGradient id="gl" x1=".2" y1="0" x2=".55" y2=".75"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="gr2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="#CFE8FF" stop-opacity=".35"/><stop offset="1" stop-color="#7FB4FF" stop-opacity=".5"/></linearGradient>
  </defs>
  <path fill-rule="evenodd" fill="url(#gm)" d="${MARK_D}"/>
  <path fill-rule="evenodd" fill="url(#gl)" d="${MARK_D}"/>
  <path fill-rule="evenodd" fill="none" stroke="url(#gr2)" stroke-width=".55" d="${MARK_D}"/>
</svg>`;

const OUT = [
  // App icons: the rounded tile on a transparent background.
  ['apps/web/src/app/apple-icon.png', 180, 180, page(180, 180, sized(icon, 'width:180px;height:180px')), true],
  ['apps/web/public/brand/oxbow-icon-192.png', 192, 192, page(192, 192, sized(icon, 'width:192px;height:192px')), true],
  ['apps/web/public/brand/oxbow-icon-512.png', 512, 512, page(512, 512, sized(icon, 'width:512px;height:512px')), true],
  // Profile picture (X, Telegram): glossy mark on light rings, everything inside the circle crop.
  ['apps/web/public/brand/social/oxbow-profile-1024.png', 1024, 1024, page(1024, 1024, profile(1024)), false],
  // X header: logo and line on the left above where the profile picture overlaps (bottom left),
  // a live-trades card on the right. A second one says the CA is coming.
  ['apps/web/public/brand/social/oxbow-x-header-1500x500.png', 1500, 500, page(1500, 500, header({ ca: false })), false],
  ['apps/web/public/brand/social/oxbow-x-header-ca-soon-1500x500.png', 1500, 500, page(1500, 500, header({ ca: true })), false],
  // Announcement cards (X posts, Telegram pinned message): 16:9 and square.
  ['apps/web/public/brand/social/oxbow-coming-soon-1600x900.png', 1600, 900, page(1600, 900, announce(1600, 900)), false],
  ['apps/web/public/brand/social/oxbow-coming-soon-1080.png', 1080, 1080, page(1080, 1080, announce(1080, 1080)), false],
];

/** Profile picture: the mark in the middle of soft rings (a river's ripples), glow behind it. */
function profile(n) {
  const c = n / 2;
  const rings = [0.3, 0.37, 0.445, 0.52]
    .map((r, i) => `<circle cx="${c}" cy="${c}" r="${n * r}" fill="none" stroke="rgba(150,205,255,${[0.16, 0.11, 0.075, 0.05][i]})" stroke-width="${n / 600}"/>`)
    .join('');
  const mark = n * 0.47;
  return `<div style="position:relative;width:${n}px;height:${n}px;overflow:hidden;background:#03060C">
    <div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 44%,#1A3868 0%,#0B1A36 36%,#050B17 68%,#03060C 100%)"></div>
    <svg width="${n}" height="${n}" style="position:absolute;inset:0">${rings}
      <circle cx="${c}" cy="${c}" r="${n * 0.3}" fill="none" stroke="url(#arc)" stroke-width="${n / 300}"/>
      <defs><linearGradient id="arc" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CFE8FF" stop-opacity=".55"/><stop offset=".35" stop-color="#CFE8FF" stop-opacity="0"/></linearGradient></defs>
    </svg>
    <div style="position:absolute;left:50%;top:50%;width:${n * 0.66}px;height:${n * 0.66}px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(closest-side,rgba(70,140,255,.5),rgba(70,140,255,0));filter:blur(${n / 40}px)"></div>
    <div style="position:absolute;left:${c - mark / 2}px;top:${c - mark / 2}px">${glossyMark(mark, `filter:drop-shadow(0 ${n / 40}px ${n / 20}px rgba(25,85,255,.55))`)}</div>
    ${grain(n, n, 0.07)}
  </div>`;
}

/** X header, 1500x500. X lays the profile picture over the bottom left (about x 40-375, y 333-500): nothing goes there. */
function header({ ca }) {
  const row = (who, side, sol, usd, ago) => `<div style="display:flex;align-items:center;gap:16px;height:58px;padding:0 22px;border-top:1px solid rgba(170,215,255,.08)">
      <span style="width:30px;height:30px;border-radius:50%;flex:none;background:linear-gradient(135deg,#9ED4FF,#2F6BFF);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)"></span>
      <span style="font:500 19px Geist;color:#E6F0FF;flex:1;white-space:nowrap">${who} <span style="margin-left:6px;font:600 11px GeistMono;letter-spacing:.14em;padding:3px 7px;border-radius:6px;color:#9ECFFF;background:rgba(111,178,255,.12);box-shadow:inset 0 0 0 1px rgba(111,178,255,.3);vertical-align:3px">SMART</span></span>
      <span style="font:600 13px GeistMono;letter-spacing:.12em;padding:5px 10px;border-radius:7px;${side === 'BUY' ? 'color:#46E3A0;background:rgba(61,220,151,.12)' : 'color:#FF7A85;background:rgba(255,92,108,.12)'}">${side}</span>
      <span style="font:500 18px GeistMono;color:#DCE8F8;width:112px;text-align:right">${sol} SOL</span>
      <span style="font:500 18px GeistMono;color:#7E93AE;width:74px;text-align:right">${usd}</span>
      <span style="font:500 15px GeistMono;color:#5F7390;width:34px;text-align:right">${ago}</span>
    </div>`;
  const below = ca
    ? `<div style="display:inline-flex;align-items:center;gap:14px;height:46px;padding:0 20px 0 7px;border-radius:14px;background:rgba(111,178,255,.08);box-shadow:inset 0 0 0 1.5px rgba(111,178,255,.32)">
        <span style="height:32px;padding:0 11px;border-radius:9px;display:grid;place-items:center;font:700 14px GeistMono;letter-spacing:.14em;color:#03060C;background:linear-gradient(180deg,#EAF5FF,#A8D3FF)">CA</span>
        <span style="font:500 18px GeistMono;letter-spacing:.08em;color:#9ECFFF">COMING SOON</span></div>`
    : `<div style="font:500 20px GeistMono;letter-spacing:.16em;color:#6FB2FF">OXBOWFLOW.COM</div>`;
  return `<div style="position:relative;width:1500px;height:500px;overflow:hidden;background:#03060C;font-family:Geist">
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,#0A1630 0%,#050B18 70%,#03060C 100%)"></div>
    <div style="position:absolute;left:-120px;top:-220px;width:900px;height:700px;background:radial-gradient(closest-side,rgba(90,160,255,.26),rgba(90,160,255,0))"></div>
    <div style="position:absolute;right:-60px;top:-120px;width:900px;height:760px;background:radial-gradient(closest-side,rgba(47,107,255,.24),rgba(47,107,255,0))"></div>
    <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:50px 50px;-webkit-mask-image:radial-gradient(ellipse at 60% 45%,#000 10%,transparent 70%);mask-image:radial-gradient(ellipse at 60% 45%,#000 10%,transparent 70%)"></div>
    <svg width="1500" height="500" style="position:absolute;inset:0">
      <defs>
        <linearGradient id="rv" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3B7BFF" stop-opacity="0"/><stop offset=".35" stop-color="#6FB2FF" stop-opacity=".55"/><stop offset=".7" stop-color="#BFE2FF" stop-opacity=".7"/><stop offset="1" stop-color="#3B7BFF" stop-opacity="0"/></linearGradient>
        <filter id="bl"><feGaussianBlur stdDeviation="9"/></filter>
      </defs>
      <path d="M-40 455 C 260 470, 420 330, 640 360 S 760 470, 900 420 S 1120 180, 1540 210" fill="none" stroke="url(#rv)" stroke-width="16" opacity=".45" filter="url(#bl)"/>
      <path d="M-40 455 C 260 470, 420 330, 640 360 S 760 470, 900 420 S 1120 180, 1540 210" fill="none" stroke="url(#rv)" stroke-width="2"/>
      <path d="M-40 480 C 280 495, 440 360, 650 392 S 780 500, 920 452 S 1140 215, 1540 245" fill="none" stroke="url(#rv)" stroke-width="1" stroke-dasharray="2 9" opacity=".7"/>
    </svg>
    <div style="position:absolute;left:118px;top:40px">
      ${sized(logo, 'height:54px;width:auto')}
      <div style="margin-top:24px;font:600 60px/1.02 Geist;letter-spacing:-.045em;color:#F1F6FF">Follow the wallets<br><span style="background:linear-gradient(92deg,#E4F2FF 0%,#9ECFFF 45%,#6FB2FF 100%);-webkit-background-clip:text;background-clip:text;color:transparent">that move first.</span></div>
      <div style="margin-top:18px">${below}</div>
    </div>
    <div style="position:absolute;right:96px;top:64px;width:600px;border-radius:24px;overflow:hidden;background:linear-gradient(180deg,rgba(22,40,70,.72),rgba(8,15,28,.82));box-shadow:inset 0 0 0 1px rgba(170,215,255,.16),0 30px 80px rgba(0,0,0,.55),0 0 0 1px rgba(0,0,0,.4)">
      <div style="display:flex;align-items:center;justify-content:space-between;height:60px;padding:0 22px">
        <span style="display:flex;align-items:center;gap:12px;font:600 15px GeistMono;letter-spacing:.2em;color:#DCEBFF"><span style="width:10px;height:10px;border-radius:50%;background:#3DDC97;box-shadow:0 0 14px #3DDC97"></span>LIVE TRADES</span>
        <span style="font:500 13px GeistMono;letter-spacing:.14em;color:#6F86A6">SOLANA</span>
      </div>
      ${row('Wallet 07', 'BUY', '42.5', '$8.1K', '4s')}
      ${row('Wallet 21', 'BUY', '18.0', '$3.4K', '11s')}
      ${row('Wallet 03', 'SELL', '96.2', '$18K', '26s')}
      ${row('Wallet 14', 'BUY', '7.25', '$1.4K', '41s')}
      <div style="display:flex;align-items:center;justify-content:space-between;height:66px;padding:0 22px;border-top:1px solid rgba(170,215,255,.08);background:rgba(111,178,255,.04)">
        <span style="font:500 17px Geist;color:#A9B8CB">Copy any trade in one tap</span>
        <span style="height:38px;padding:0 18px;border-radius:11px;display:grid;place-items:center;font:600 15px Geist;color:#03060C;background:linear-gradient(180deg,#EAF5FF,#A8D3FF);box-shadow:0 8px 24px rgba(111,178,255,.35)">Copy trade</span>
      </div>
    </div>
    ${grain(1500, 500, 0.05)}
  </div>`;
}

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
