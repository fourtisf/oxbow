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
  // X article cover (5:2).
  ['apps/web/public/brand/social/oxbow-article-cover-2000x800.png', 2000, 800, page(2000, 800, cover()), false],
  // Premium article banners (5:2), laid out at 2000x800 and rendered at 1.5x: 3000x1200.
  ['apps/web/public/brand/social/oxbow-article-banner-orbit-3000x1200.png', 2000, 800, page(2000, 800, bannerOrbit()), false, 1.5],
  ['apps/web/public/brand/social/oxbow-article-banner-depth-3000x1200.png', 2000, 800, page(2000, 800, bannerDepth()), false, 1.5],
  ['apps/web/public/brand/social/oxbow-article-banner-ring-3000x1200.png', 2000, 800, page(2000, 800, bannerRing()), false, 1.5],
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

/** A live-trades card like the site's feed (illustrative wallets). */
function row(who, side, sol, usd, ago) {
  return `<div style="display:flex;align-items:center;gap:16px;height:58px;padding:0 22px;border-top:1px solid rgba(170,215,255,.08)">
      <span style="width:30px;height:30px;border-radius:50%;flex:none;background:linear-gradient(135deg,#9ED4FF,#2F6BFF);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)"></span>
      <span style="font:500 19px Geist;color:#E6F0FF;flex:1;white-space:nowrap">${who} <span style="margin-left:6px;font:600 11px GeistMono;letter-spacing:.14em;padding:3px 7px;border-radius:6px;color:#9ECFFF;background:rgba(111,178,255,.12);box-shadow:inset 0 0 0 1px rgba(111,178,255,.3);vertical-align:3px">SMART</span></span>
      <span style="font:600 13px GeistMono;letter-spacing:.12em;padding:5px 10px;border-radius:7px;${side === 'BUY' ? 'color:#46E3A0;background:rgba(61,220,151,.12)' : 'color:#FF7A85;background:rgba(255,92,108,.12)'}">${side}</span>
      <span style="font:500 18px GeistMono;color:#DCE8F8;width:112px;text-align:right">${sol} SOL</span>
      <span style="font:500 18px GeistMono;color:#7E93AE;width:74px;text-align:right">${usd}</span>
      <span style="font:500 15px GeistMono;color:#5F7390;width:34px;text-align:right">${ago}</span>
    </div>`;
}
function liveCard(width, solid = false) {
  return `<div style="width:${width}px;border-radius:24px;overflow:hidden;background:${solid ? 'linear-gradient(180deg,#16294A,#0A1426)' : 'linear-gradient(180deg,rgba(22,40,70,.72),rgba(8,15,28,.82))'};box-shadow:inset 0 0 0 1px rgba(170,215,255,.16),0 30px 80px rgba(0,0,0,.55),0 0 0 1px rgba(0,0,0,.4)">
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
  </div>`;
}

/** X header, 1500x500. X lays the profile picture over the bottom left (about x 40-375, y 333-500): nothing goes there. */
function header({ ca }) {
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
    <div style="position:absolute;right:96px;top:64px">${liveCard(600)}</div>
    ${grain(1500, 500, 0.05)}
  </div>`;
}

/** Shared deep-navy stage for the article banners: base gradient, two glows, a faint grid, grain on top (added by the caller). */
function stage(extra = '') {
  return `<div style="position:absolute;inset:0;background:radial-gradient(120% 140% at 70% 40%,#10234A 0%,#081530 38%,#040A17 70%,#02050C 100%)"></div>
    <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px);background-size:64px 64px;-webkit-mask-image:radial-gradient(ellipse at 70% 50%,#000 0%,transparent 62%);mask-image:radial-gradient(ellipse at 70% 50%,#000 0%,transparent 62%)"></div>
    ${extra}
    <div style="position:absolute;inset:0;background:radial-gradient(130% 120% at 50% 50%,transparent 55%,rgba(0,0,0,.55) 100%)"></div>`;
}

/** Headline block for the banners' left side. */
function bannerCopy({ top = 168, size = 104 } = {}) {
  return `<div style="position:absolute;left:160px;top:${top}px;width:880px">
      <div style="display:inline-flex;align-items:center;gap:14px;padding:12px 22px;border-radius:999px;background:rgba(111,178,255,.09);box-shadow:inset 0 0 0 1.5px rgba(111,178,255,.32);font:500 19px GeistMono;letter-spacing:.22em;color:#A9D6FF">
        <span style="width:10px;height:10px;border-radius:50%;background:#3DDC97;box-shadow:0 0 16px #3DDC97"></span>INTRODUCING OXBOW
      </div>
      <div style="margin-top:34px;font:600 ${size}px/.98 Geist;letter-spacing:-.05em;color:#F3F8FF;text-shadow:0 2px 40px rgba(0,0,0,.35)">Follow the wallets<br><span style="background:linear-gradient(92deg,#F0F8FF 0%,#A9D6FF 40%,#5FA8FF 100%);-webkit-background-clip:text;background-clip:text;color:transparent">that move first.</span></div>
      <div style="margin-top:34px;font:500 29px/1.45 Geist;color:#A7B9D0;max-width:760px">Smart-money trades on Solana, live. Copy any of them in one tap, from your own wallet.</div>
    </div>
    <div style="position:absolute;left:160px;bottom:72px;display:flex;align-items:center;gap:22px">
      ${sized(logo, 'height:46px;width:auto')}
      <span style="width:1px;height:30px;background:rgba(170,215,255,.25)"></span>
      <span style="font:500 21px GeistMono;letter-spacing:.18em;color:#7FBCFF">OXBOWFLOW.COM</span>
    </div>`;
}

/** A small glass chip floating in the scene. */
function chip(x, y, inner, css = '') {
  return `<div style="position:absolute;left:${x}px;top:${y}px;display:flex;align-items:center;gap:12px;padding:14px 20px;border-radius:16px;background:linear-gradient(180deg,rgba(28,50,86,.78),rgba(10,20,38,.82));box-shadow:inset 0 0 0 1px rgba(170,215,255,.2),0 20px 50px rgba(0,0,0,.5);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);font:500 20px Geist;color:#E6F0FF;white-space:nowrap;${css}">${inner}</div>`;
}
function pill(side) {
  return `<span style="font:600 14px GeistMono;letter-spacing:.12em;padding:5px 10px;border-radius:8px;${side === 'BUY' ? 'color:#46E3A0;background:rgba(61,220,151,.14)' : 'color:#FF7A85;background:rgba(255,92,108,.14)'}">${side}</span>`;
}
function smartTag() {
  return `<span style="font:600 12px GeistMono;letter-spacing:.14em;padding:4px 8px;border-radius:7px;color:#A9D6FF;background:rgba(111,178,255,.13);box-shadow:inset 0 0 0 1px rgba(111,178,255,.32)">SMART</span>`;
}

/** Banner A, "Orbit": the glossy mark on the right inside rings of ripples, live trades orbiting it. */
function bannerOrbit() {
  const cx = 1500, cy = 400;
  const rings = [250, 330, 420, 520, 630, 750]
    .map((r, i) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(160,210,255,${[0.2, 0.15, 0.11, 0.08, 0.06, 0.045][i]})" stroke-width="1.6"/>`)
    .join('');
  const scene = `<svg width="2000" height="800" style="position:absolute;inset:0">
      <defs>
        <linearGradient id="ra" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#DDF0FF" stop-opacity=".75"/><stop offset=".3" stop-color="#DDF0FF" stop-opacity="0"/></linearGradient>
        <linearGradient id="rb" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#5FA8FF" stop-opacity=".6"/><stop offset=".35" stop-color="#5FA8FF" stop-opacity="0"/></linearGradient>
      </defs>
      ${rings}
      <circle cx="${cx}" cy="${cy}" r="330" fill="none" stroke="url(#ra)" stroke-width="3"/>
      <circle cx="${cx}" cy="${cy}" r="520" fill="none" stroke="url(#rb)" stroke-width="2.4"/>
      <circle cx="${cx + 330 * Math.cos(-0.9)}" cy="${cy + 330 * Math.sin(-0.9)}" r="6" fill="#DDF0FF"/>
      <circle cx="${cx + 520 * Math.cos(2.5)}" cy="${cy + 520 * Math.sin(2.5)}" r="5" fill="#7FBCFF"/>
    </svg>
    <div style="position:absolute;left:${cx - 420}px;top:${cy - 420}px;width:840px;height:840px;border-radius:50%;background:radial-gradient(closest-side,rgba(70,140,255,.55),rgba(70,140,255,.12) 55%,rgba(70,140,255,0));filter:blur(14px)"></div>
    <div style="position:absolute;left:${cx - 900}px;top:-200px;width:1200px;height:420px;transform:rotate(-18deg);background:linear-gradient(90deg,rgba(160,210,255,0),rgba(160,210,255,.07),rgba(160,210,255,0));filter:blur(30px)"></div>
    <div style="position:absolute;left:${cx - 190}px;top:${cy - 190}px">${glossyMark(380, 'filter:drop-shadow(0 30px 60px rgba(25,85,255,.6))')}</div>
    ${chip(cx + 150, cy - 300, `${pill('BUY')}<span>42.5 SOL</span><span style="color:#6F86A6;font:500 16px GeistMono">4s</span>`)}
    ${chip(cx + 190, cy + 160, `<span style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#9ED4FF,#2F6BFF)"></span><span>Wallet 21</span>${smartTag()}`)}
    ${chip(cx - 470, cy + 210, `${pill('SELL')}<span>96.2 SOL</span><span style="color:#6F86A6;font:500 16px GeistMono">26s</span>`)}
    ${chip(cx - 330, cy - 300, `<span style="width:9px;height:9px;border-radius:50%;background:#3DDC97;box-shadow:0 0 12px #3DDC97"></span><span style="font:600 15px GeistMono;letter-spacing:.2em">LIVE</span>`)}`;
  return `<div style="position:relative;width:2000px;height:800px;overflow:hidden;background:#02050C;font-family:Geist">
    ${stage(scene)}
    ${bannerCopy()}
    ${grain(2000, 800, 0.06)}
  </div>`;
}

/** Banner B, "Depth": the product in perspective, three of its screens stacked and lit. */
function bannerDepth() {
  const panel = (w, inner, css = '') =>
    `<div style="width:${w}px;border-radius:26px;overflow:hidden;background:linear-gradient(180deg,#182C50,#0A1426);box-shadow:inset 0 0 0 1px rgba(170,215,255,.2),0 40px 90px rgba(0,0,0,.6);${css}">${inner}</div>`;
  const head = (label, right = '') =>
    `<div style="display:flex;align-items:center;justify-content:space-between;height:62px;padding:0 24px;border-bottom:1px solid rgba(170,215,255,.08)"><span style="font:600 15px GeistMono;letter-spacing:.2em;color:#DCEBFF">${label}</span><span style="font:500 13px GeistMono;letter-spacing:.14em;color:#6F86A6">${right}</span></div>`;
  // Illustrative wallet: a smooth PnL curve.
  const pts = [0, 12, 8, 26, 22, 40, 36, 58, 52, 74, 70, 92].map((v, i) => `${i * 40},${130 - v}`).join(' ');
  const wallet = panel(
    520,
    `${head('WALLET 07', 'SMART')}
     <div style="padding:22px 24px 26px">
       <div style="font:500 15px GeistMono;letter-spacing:.14em;color:#7E93AE">REALIZED · 30D</div>
       <div style="margin-top:6px;font:600 52px Geist;letter-spacing:-.03em;color:#46E3A0">+$12.4K</div>
       <svg width="440" height="140" style="display:block;margin-top:10px"><defs><linearGradient id="pf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#46E3A0" stop-opacity=".35"/><stop offset="1" stop-color="#46E3A0" stop-opacity="0"/></linearGradient></defs>
         <polygon points="0,140 ${pts} 440,140" fill="url(#pf)"/><polyline points="${pts}" fill="none" stroke="#46E3A0" stroke-width="3" stroke-linejoin="round"/></svg>
     </div>`,
  );
  const check = (t) => `<div style="display:flex;align-items:center;gap:12px;height:46px;font:500 18px Geist;color:#DCE8F8"><span style="width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:rgba(61,220,151,.16);color:#46E3A0;font:700 14px Geist">✓</span>${t}</div>`;
  const safety = panel(400, `${head('SAFETY CHECK', 'OK')}<div style="padding:12px 24px 16px">${check('Mint authority off')}${check('Freeze authority off')}${check('Organic trading')}${check('Jupiter verified')}</div>`);
  return `<div style="position:relative;width:2000px;height:800px;overflow:hidden;background:#02050C;font-family:Geist">
    ${stage(`<div style="position:absolute;left:1000px;top:-100px;width:1200px;height:1000px;border-radius:50%;background:radial-gradient(closest-side,rgba(60,130,255,.35),rgba(60,130,255,0));filter:blur(10px)"></div>`)}
    <div style="position:absolute;left:1060px;top:70px;width:900px;height:700px;perspective:2000px">
      <div style="position:absolute;left:330px;top:-40px;transform:rotateY(-24deg) rotateX(8deg) translateZ(-160px);filter:brightness(.82)">${wallet}</div>
      <div style="position:absolute;left:0;top:230px;transform:rotateY(-24deg) rotateX(8deg)">${liveCard(600, true)}</div>
      <div style="position:absolute;left:560px;top:440px;transform:rotateY(-24deg) rotateX(8deg) translateZ(120px)">${safety}</div>
    </div>
    ${bannerCopy()}
    ${grain(2000, 800, 0.06)}
  </div>`;
}

/** Banner C, "Ring": one huge oxbow ring of light behind a centered headline. */
function bannerRing() {
  return `<div style="position:relative;width:2000px;height:800px;overflow:hidden;background:#02050C;font-family:Geist">
    ${stage()}
    <svg width="2000" height="800" style="position:absolute;inset:0;-webkit-mask-image:radial-gradient(ellipse 700px 330px at 50% 50%,transparent 66%,#000 100%);mask-image:radial-gradient(ellipse 700px 330px at 50% 50%,transparent 66%,#000 100%)">
      <defs>
        <linearGradient id="rg" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F0F8FF"/><stop offset=".45" stop-color="#8FCBFF"/><stop offset="1" stop-color="#2F6BFF"/></linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter>
      </defs>
      <g transform="translate(1000 400) scale(10.5) translate(-64 -64)" opacity=".9">
        <path fill-rule="evenodd" fill="url(#rg)" opacity=".16" d="${MARK_D}" filter="url(#glow)"/>
        <path fill-rule="evenodd" fill="none" stroke="url(#rg)" stroke-width=".28" d="${MARK_D}"/>
      </g>
      <g transform="translate(1000 400) scale(10.5) translate(-64 -64)">
        <circle cx="64" cy="64" r="47" fill="none" stroke="rgba(160,210,255,.08)" stroke-width=".15"/>
        <circle cx="64" cy="64" r="53" fill="none" stroke="rgba(160,210,255,.05)" stroke-width=".15"/>
      </g>
    </svg>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
      <div style="display:inline-flex;align-items:center;gap:14px;padding:12px 22px;border-radius:999px;background:rgba(5,12,26,.7);box-shadow:inset 0 0 0 1.5px rgba(111,178,255,.32);font:500 19px GeistMono;letter-spacing:.22em;color:#A9D6FF">
        <span style="width:10px;height:10px;border-radius:50%;background:#3DDC97;box-shadow:0 0 16px #3DDC97"></span>INTRODUCING OXBOW
      </div>
      <div style="margin-top:34px;font:600 118px/.98 Geist;letter-spacing:-.05em;color:#F3F8FF;text-shadow:0 4px 60px rgba(0,0,0,.6)">Follow the wallets<br><span style="background:linear-gradient(92deg,#F0F8FF 0%,#A9D6FF 40%,#5FA8FF 100%);-webkit-background-clip:text;background-clip:text;color:transparent">that move first.</span></div>
      <div style="margin-top:32px;font:500 28px/1.45 Geist;color:#A7B9D0">Smart money on Solana, live. Copy any trade in one tap.</div>
    </div>
    <div style="position:absolute;left:0;right:0;bottom:56px;display:flex;justify-content:center;align-items:center;gap:22px">
      ${sized(logo, 'height:40px;width:auto')}
      <span style="width:1px;height:26px;background:rgba(170,215,255,.25)"></span>
      <span style="font:500 19px GeistMono;letter-spacing:.18em;color:#7FBCFF">OXBOWFLOW.COM</span>
    </div>
    ${grain(2000, 800, 0.06)}
  </div>`;
}

/** X article cover, 2000x800 (5:2): the launch story's headline, with the live feed beside it. */
function cover() {
  return `<div style="position:relative;width:2000px;height:800px;overflow:hidden;background:#03060C;font-family:Geist">
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,#0A1630 0%,#050B18 70%,#03060C 100%)"></div>
    <div style="position:absolute;left:-160px;top:-300px;width:1200px;height:1000px;background:radial-gradient(closest-side,rgba(90,160,255,.26),rgba(90,160,255,0))"></div>
    <div style="position:absolute;right:-100px;top:-160px;width:1200px;height:1100px;background:radial-gradient(closest-side,rgba(47,107,255,.24),rgba(47,107,255,0))"></div>
    <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:64px 64px;-webkit-mask-image:radial-gradient(ellipse at 60% 45%,#000 10%,transparent 70%);mask-image:radial-gradient(ellipse at 60% 45%,#000 10%,transparent 70%)"></div>
    <svg width="2000" height="800" style="position:absolute;inset:0">
      <defs>
        <linearGradient id="rv" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3B7BFF" stop-opacity="0"/><stop offset=".35" stop-color="#6FB2FF" stop-opacity=".55"/><stop offset=".7" stop-color="#BFE2FF" stop-opacity=".7"/><stop offset="1" stop-color="#3B7BFF" stop-opacity="0"/></linearGradient>
        <filter id="bl"><feGaussianBlur stdDeviation="12"/></filter>
      </defs>
      <path d="M-60 770 C 380 780, 640 690, 920 712 S 1060 770, 1210 700 S 1500 300, 2060 340" fill="none" stroke="url(#rv)" stroke-width="20" opacity=".45" filter="url(#bl)"/>
      <path d="M-60 770 C 380 780, 640 690, 920 712 S 1060 770, 1210 700 S 1500 300, 2060 340" fill="none" stroke="url(#rv)" stroke-width="2.5"/>
      <path d="M-60 800 C 400 810, 660 725, 935 748 S 1080 800, 1235 738 S 1525 345, 2060 385" fill="none" stroke="url(#rv)" stroke-width="1.2" stroke-dasharray="2 10" opacity=".7"/>
    </svg>
    <div style="position:absolute;left:150px;top:150px;width:900px">
      ${sized(logo, 'height:72px;width:auto')}
      <div style="margin-top:46px;display:inline-flex;align-items:center;gap:14px;padding:12px 22px;border-radius:999px;background:rgba(111,178,255,.1);box-shadow:inset 0 0 0 1.5px rgba(111,178,255,.35);font:500 20px GeistMono;letter-spacing:.2em;color:#9ECFFF">
        <span style="width:11px;height:11px;border-radius:50%;background:#3DDC97;box-shadow:0 0 16px #3DDC97"></span>INTRODUCING OXBOW
      </div>
      <div style="margin-top:28px;font:600 96px/1 Geist;letter-spacing:-.045em;color:#F1F6FF">Follow the wallets<br><span style="background:linear-gradient(92deg,#E4F2FF 0%,#9ECFFF 45%,#6FB2FF 100%);-webkit-background-clip:text;background-clip:text;color:transparent">that move first.</span></div>
      <div style="margin-top:30px;font:500 30px/1.4 Geist;color:#A9B8CB;max-width:780px">Smart-money trades on Solana, live. Copy any of them in one tap, from your own wallet.</div>
    </div>
    <div style="position:absolute;right:150px;top:150px;zoom:1.25">${liveCard(600)}</div>
    <div style="position:absolute;right:150px;bottom:64px;font:500 24px GeistMono;letter-spacing:.16em;color:#6FB2FF">OXBOWFLOW.COM</div>
    ${grain(2000, 800, 0.05)}
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
for (const [file, w, h, html, transparent, scale = 1] of OUT.filter(([f]) => !only || f.includes(only))) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await p.setContent(html);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(root, file), omitBackground: transparent });
  await p.close();
  console.log('wrote', file);
}
await browser.close();
