/**
 * Renders the Oxbow intro video (scripts/video/intro.html) frame by frame with
 * apps/web's Playwright and encodes it with ffmpeg: 1920x1080, 30 fps, H.264.
 *
 *   node scripts/video/render.mjs out.mp4              (the whole video, silent)
 *   node scripts/video/render.mjs --stills dir 1,8,14  (PNG stills at those seconds, to check a scene)
 *
 * The page's animation is a pure function of time (window.render(t)), so every
 * frame is exact no matter how long a screenshot takes.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const { chromium } = createRequire(join(root, 'apps/web/package.json'))('@playwright/test');
const font = (f) => `data:font/woff2;base64,${readFileSync(join(root, 'apps/web/node_modules/geist/dist/fonts', f)).toString('base64')}`;
const brand = (f) => readFileSync(join(root, 'apps/web/public/brand', f), 'utf8');
const sized = (svg, css) => svg.replace('<svg ', `<svg style="display:block;${css}" `);

const MARK_D = 'M106 64A42 42 0 1 1 22 64A42 42 0 1 1 106 64ZM97 56A25 25 0 1 0 47 56A25 25 0 1 0 97 56Z';
const glossyMark = (size) => `<svg viewBox="22 22 84 84" width="${size}" height="${size}" style="display:block;overflow:visible">
  <defs>
    <linearGradient id="gm" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2FAFF"/><stop offset=".42" stop-color="#93CEFF"/><stop offset="1" stop-color="#2F6BFF"/></linearGradient>
    <linearGradient id="gl" x1=".2" y1="0" x2=".55" y2=".75"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="gr2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="#CFE8FF" stop-opacity=".35"/><stop offset="1" stop-color="#7FB4FF" stop-opacity=".5"/></linearGradient>
  </defs>
  <path fill-rule="evenodd" fill="url(#gm)" d="${MARK_D}"/>
  <path fill-rule="evenodd" fill="url(#gl)" d="${MARK_D}"/>
  <path fill-rule="evenodd" fill="none" stroke="url(#gr2)" stroke-width=".55" d="${MARK_D}"/>
</svg>`;

const logo = brand('oxbow-logo.svg');
// The wordmark alone: the logo without its mark, cropped to the letters.
const word = logo.replace(/<g transform="translate\(-6 -6\) scale\(\.84\)">[\s\S]*?<\/g>/, '').replace(/viewBox="[^"]*"/, 'viewBox="92 0 209 96"');

const html = readFileSync(join(here, 'intro.html'), 'utf8')
  .replace('%%FONT_MEDIUM%%', font('geist-sans/Geist-Medium.woff2'))
  .replace('%%FONT_SEMIBOLD%%', font('geist-sans/Geist-SemiBold.woff2'))
  .replace('%%FONT_MONO%%', font('geist-mono/GeistMono-Medium.woff2'))
  .replace('%%MARK%%', glossyMark(380))
  .replace('%%LOGO_WORD%%', sized(word, 'height:110px;width:auto'))
  .replace('%%LOGO%%', sized(logo, 'height:112px;width:auto'))
  .replace('%%LOGO_SMALL%%', sized(logo, 'height:36px;width:auto'));

const FPS = 30;
const args = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
const duration = await page.evaluate(() => window.DURATION);

if (args[0] === '--stills') {
  const dir = args[1];
  mkdirSync(dir, { recursive: true });
  for (const s of args[2].split(',').map(Number)) {
    await page.evaluate((t) => window.render(t), s);
    await page.screenshot({ path: join(dir, `still-${String(s).padStart(5, '0')}.png`) });
  }
  console.log('stills written to', dir);
} else {
  const out = args[0] ?? 'oxbow-intro.mp4';
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(duration * FPS);
  const started = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.render(t), i / FPS);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i}/${frames} (${Math.round((Date.now() - started) / 1000)}s)`);
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on('close', (code) => (code === 0 ? r() : j(new Error(`ffmpeg exited ${code}`)))));
  console.log('wrote', out);
}
await browser.close();
