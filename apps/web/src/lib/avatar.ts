'use client';

/**
 * Deterministic token avatars, ported from the prototype's `makeAvatar`:
 * a brand tile (with an "x" badge for stocks) when the asset has a brand,
 * otherwise a mirrored pixel identicon seeded by the symbol. Drawn on a canvas
 * once per symbol and cached as a data URL.
 */
import { hash, rng, type Brand } from '@oxbow/shared';

const N = 128;
const cache = new Map<string, string>();
let version = 0;
const listeners = new Set<() => void>();

function sansFamily(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--font-geist-sans').trim();
  return (v ? v + ', ' : '') + 'Geist, Inter, system-ui, sans-serif';
}

function rrect(x: CanvasRenderingContext2D, X: number, Y: number, W: number, H: number, R: number) {
  x.beginPath();
  x.moveTo(X + R, Y);
  x.arcTo(X + W, Y, X + W, Y + H, R);
  x.arcTo(X + W, Y + H, X, Y + H, R);
  x.arcTo(X, Y + H, X, Y, R);
  x.arcTo(X, Y, X + W, Y, R);
  x.closePath();
}

/** Light brand colors (Apple's silver) get dark lettering. */
function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 200;
}

function draw(sym: string, brand: Brand | null): string {
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d');
  if (!x) return '';
  if (brand) {
    const font = sansFamily();
    rrect(x, 0, 0, N, N, N * 0.28);
    x.save();
    x.clip();
    const g = x.createLinearGradient(0, 0, N, N);
    g.addColorStop(0, brand.a);
    g.addColorStop(1, brand.b);
    x.fillStyle = g;
    x.fillRect(0, 0, N, N);
    const gl = x.createLinearGradient(0, 0, 0, N * 0.62);
    gl.addColorStop(0, 'rgba(255,255,255,.38)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gl;
    x.fillRect(0, 0, N, N * 0.62);
    const t = brand.monogram;
    x.fillStyle = isLight(brand.a) ? '#1A222D' : '#fff';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `800 ${t.length > 2 ? 40 : t.length > 1 ? 52 : 68}px ${font}`;
    x.shadowColor = 'rgba(0,0,0,.25)';
    x.shadowBlur = 6;
    x.shadowOffsetY = 2;
    x.fillText(t, N / 2, N / 2 + 3);
    x.shadowColor = 'transparent';
    if (brand.stock) {
      x.fillStyle = 'rgba(4,10,20,.78)';
      x.beginPath();
      x.arc(N - 24, N - 24, 17, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#fff';
      x.font = `800 22px ${font}`;
      x.fillText('x', N - 24, N - 25);
    }
    x.restore();
  } else {
    const r = rng(hash(sym + 'av'));
    const h = Math.floor(r() * 360);
    x.beginPath();
    x.arc(N / 2, N / 2, N / 2, 0, Math.PI * 2);
    x.save();
    x.clip();
    const g = x.createRadialGradient(N * 0.32, N * 0.28, N * 0.04, N * 0.5, N * 0.55, N * 0.72);
    g.addColorStop(0, `hsl(${h},90%,74%)`);
    g.addColorStop(0.55, `hsl(${(h + 25) % 360},72%,52%)`);
    g.addColorStop(1, `hsl(${(h + 50) % 360},70%,26%)`);
    x.fillStyle = g;
    x.fillRect(0, 0, N, N);
    const G = 7;
    const cell = 10;
    const ox = (N - G * cell) / 2;
    const oy = (N - G * cell) / 2 + 2;
    const on: boolean[][] = [];
    for (let yy = 0; yy < G; yy++) {
      on[yy] = [];
      for (let xx = 0; xx < 4; xx++) on[yy]![xx] = r() < 0.52;
    }
    on[2]![1] = true;
    on[2]![2] = false;
    on[3]![3] = true;
    const lit = (yy: number, xx: number) => on[yy]![xx < 4 ? xx : G - 1 - xx];
    x.fillStyle = 'rgba(4,10,20,.28)';
    for (let yy = 0; yy < G; yy++)
      for (let xx = 0; xx < G; xx++) if (lit(yy, xx)) x.fillRect(ox + xx * cell + 2, oy + yy * cell + 3, cell, cell);
    x.fillStyle = 'rgba(255,255,255,.92)';
    for (let yy = 0; yy < G; yy++)
      for (let xx = 0; xx < G; xx++) if (lit(yy, xx)) x.fillRect(ox + xx * cell, oy + yy * cell, cell, cell);
    const gl = x.createRadialGradient(N * 0.3, N * 0.18, 2, N * 0.3, N * 0.18, N * 0.5);
    gl.addColorStop(0, 'rgba(255,255,255,.45)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gl;
    x.fillRect(0, 0, N, N);
    x.restore();
  }
  return c.toDataURL('image/png');
}

const keyOf = (sym: string, brand: Brand | null) =>
  brand ? `b:${sym}:${brand.a}:${brand.b}:${brand.monogram}:${brand.stock ? 1 : 0}` : `i:${sym}`;

export function avatarSrc(sym: string, brand: Brand | null): string {
  const k = keyOf(sym, brand);
  let v = cache.get(k);
  if (v === undefined) {
    v = draw(sym, brand);
    cache.set(k, v);
  }
  return v;
}

// Brand tiles draw text with Geist. Redraw them once the web font has loaded.
if (typeof document !== 'undefined' && document.fonts?.ready) {
  document.fonts.ready.then(() => {
    let changed = false;
    for (const k of cache.keys())
      if (k.startsWith('b:')) {
        cache.delete(k);
        changed = true;
      }
    if (changed) {
      version++;
      listeners.forEach((l) => l());
    }
  });
}

export const avatarStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  version: () => version,
};
