import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { fromSubscript } from '@oxbow/shared';

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

export interface OgPool {
  pair: string;
  baseLogo: string | null;
  quoteLogo: string | null;
  /** Stock logos are rounded squares, others circles. */
  quoteSquare: boolean;
  name: string;
  price: string;
  change: number;
  changeText: string;
  status: string;
  statusTone: 'ice' | 'up' | 'amber' | 'down';
  venue: string;
}

function Frame({ children }: { children: React.ReactNode }) {
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 6, padding: 12, background: 'linear-gradient(180deg,#16263D,#0A1422)', border: '1px solid rgba(170,215,255,.35)' }}>
          <div style={{ width: 7, height: 16, borderRadius: 2, background: '#9ECFFF' }} />
          <div style={{ width: 7, height: 24, borderRadius: 2, background: '#D6EBFF' }} />
          <div style={{ width: 7, height: 12, borderRadius: 2, background: '#6FB2FF' }} />
        </div>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1.5 }}>Oxbow</div>
      </div>
      {children}
    </div>
  );
}

/** "$0.0₅228" with the zero count drawn as a small lowered number, like the site's <sub>. */
function Price({ text }: { text: string }) {
  const parts = text.split(/([₀-₉]+)/);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', fontSize: 76, fontWeight: 700, letterSpacing: -3 }}>
      {parts.map((x, i) =>
        i % 2 ? (
          <span key={i} style={{ fontSize: 44, marginBottom: -6, letterSpacing: 0 }}>
            {fromSubscript(x)}
          </span>
        ) : (
          <span key={i}>{x}</span>
        ),
      )}
    </div>
  );
}

export async function siteOgImage(title: string, sub: string) {
  return new ImageResponse(
    (
      <Frame>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 92, fontWeight: 700, lineHeight: 1, letterSpacing: -4 }}>
            <span>Pick a meme.</span>
            <span style={{ color: C.ice }}>Pair a stock.</span>
          </div>
          <div style={{ fontSize: 30, color: C.text2, maxWidth: 900 }}>{sub}</div>
        </div>
        <div style={{ display: 'flex', fontFamily: 'Geist Mono', fontSize: 22, color: C.text3, letterSpacing: 3 }}>{title.toUpperCase()}</div>
      </Frame>
    ),
    { ...OG_SIZE, fonts: await loadFonts() },
  );
}

export async function poolOgImage(p: OgPool) {
  const tone = { ice: C.ice, up: C.up, amber: C.amber, down: C.down }[p.statusTone];
  const chg = p.change >= 0 ? C.up : C.down;
  return new ImageResponse(
    (
      <Frame>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            {(p.baseLogo || p.quoteLogo) && (
              <div style={{ display: 'flex', width: 96 + 62, height: 96, position: 'relative' }}>
                {p.baseLogo && <img src={p.baseLogo} alt="" width={96} height={96} style={{ position: 'absolute', left: 0, top: 0, borderRadius: 48 }} />}
                {p.quoteLogo && (
                  <img src={p.quoteLogo} alt="" width={96} height={96} style={{ position: 'absolute', left: 62, top: 0, borderRadius: p.quoteSquare ? 27 : 48, border: `4px solid ${C.bg}` }} />
                )}
              </div>
            )}
            <div style={{ fontFamily: 'Geist Mono', fontSize: 84, fontWeight: 600, letterSpacing: -2 }}>{p.pair}</div>
          </div>
          <div style={{ fontSize: 30, color: C.text2 }}>{p.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 24 }}>
            <Price text={p.price} />
            <div style={{ display: 'flex', fontFamily: 'Geist Mono', fontSize: 34, fontWeight: 600, color: chg, background: p.change >= 0 ? 'rgba(61,220,151,.12)' : 'rgba(255,90,110,.12)', padding: '8px 18px', borderRadius: 14 }}>
              {p.changeText}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontFamily: 'Geist Mono', fontSize: 24, fontWeight: 600 }}>
          <div style={{ display: 'flex', color: tone, border: `2px solid ${tone}`, borderRadius: 12, padding: '8px 16px', letterSpacing: 2 }}>{p.status}</div>
          <div style={{ display: 'flex', color: C.text3, letterSpacing: 2 }}>{p.venue.toUpperCase()}</div>
        </div>
      </Frame>
    ),
    { ...OG_SIZE, fonts: await loadFonts() },
  );
}
