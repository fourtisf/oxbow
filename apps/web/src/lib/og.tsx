import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { siteUrl } from './links';

/** Social preview images (1200×630), drawn with the site's Geist fonts. */
export const OG_SIZE = { width: 1200, height: 630 };

const fontDir = path.join(process.cwd(), 'node_modules/geist/dist/fonts');
let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 600 | 700; style: 'normal' }[]> | null = null;

function loadFonts() {
  fonts ??= Promise.all([
    readFile(path.join(fontDir, 'geist-sans/Geist-SemiBold.ttf')).then((data) => ({ name: 'Geist', data, weight: 600 as const, style: 'normal' as const })),
    readFile(path.join(fontDir, 'geist-sans/Geist-Bold.ttf')).then((data) => ({ name: 'Geist', data, weight: 700 as const, style: 'normal' as const })),
    readFile(path.join(fontDir, 'geist-mono/GeistMono-SemiBold.ttf')).then((data) => ({ name: 'Geist Mono', data, weight: 600 as const, style: 'normal' as const })),
  ]);
  return fonts;
}

const C = { bg: '#03060C', text: '#F1F6FF', text2: '#A9B8CB', text3: '#6B7C92', ice: '#9ECFFF', up: '#3DDC97', down: '#FF5A6E', amber: '#FFB86B' };

const publicDir = path.join(process.cwd(), 'public');
const MIME: Record<string, string> = { '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

/**
 * A logo as a data URI for the image renderer. Only files under public/ are
 * read; remote logos are skipped here (the M2 API serves them through its own
 * image proxy).
 */
export async function logoData(uri: string | null): Promise<string | null> {
  if (!uri?.startsWith('/')) return null;
  const file = path.normalize(path.join(publicDir, uri));
  const mime = MIME[path.extname(file).toLowerCase()];
  if (!mime || !file.startsWith(publicDir + path.sep)) return null;
  try {
    return `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
  } catch {
    return null;
  }
}

/** The site's host for the corner of the card, e.g. "oxbowflow.com". */
const host = () => new URL(siteUrl()).host.replace(/^www\./, '');

function Frame({ brand, children }: { brand: string | null; children: React.ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        color: C.text,
        fontFamily: 'Geist',
        backgroundColor: C.bg,
        backgroundImage: 'radial-gradient(circle at 85% 0%, rgba(110,170,255,.30), rgba(3,6,12,0) 55%), radial-gradient(circle at 0% 100%, rgba(169,155,255,.16), rgba(3,6,12,0) 50%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {brand && <img src={brand} alt="" width={60} height={60} />}
          <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: -2 }}>oxbow</div>
        </div>
        <div style={{ display: 'flex', fontFamily: 'Geist Mono', fontSize: 22, color: C.text3, letterSpacing: 1 }}>{host()}</div>
      </div>
      {children}
    </div>
  );
}

const brandIcon = () => logoData('/brand/oxbow-icon.svg');

export async function siteOgImage(title: string, sub: string) {
  return new ImageResponse(
    (
      <Frame brand={await brandIcon()}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 92, fontWeight: 700, lineHeight: 1, letterSpacing: -4 }}>
            <span>Follow the wallets</span>
            <span style={{ color: C.ice }}>that move first.</span>
          </div>
          <div style={{ fontSize: 30, color: C.text2, maxWidth: 900 }}>{sub}</div>
        </div>
        <div style={{ display: 'flex', fontFamily: 'Geist Mono', fontSize: 22, color: C.text3, letterSpacing: 3 }}>{title.toUpperCase()}</div>
      </Frame>
    ),
    { ...OG_SIZE, fonts: await loadFonts() },
  );
}
