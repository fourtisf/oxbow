'use client';

/**
 * Isometric pixel city behind the hero, ported as-is from the prototype's
 * `cityRenderer` / `startCity`: capped at 24fps, paused while offscreen or the
 * tab is hidden, and a single static frame under prefers-reduced-motion or lite mode.
 */
import { useEffect, useRef } from 'react';
import { hash, rng } from '@oxbow/shared';

interface Box {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  ant?: number;
  roof?: number;
}
const CITY: { towers: Box[]; stacks: { x: number; y: number; n: number }[]; kiosks: Box[] } = {
  towers: [
    { x: 1, y: 1, w: 2, d: 2, h: 9 },
    { x: 4.2, y: 0, w: 2, d: 2, h: 15, ant: 1 },
    { x: 7.4, y: 0.6, w: 2.2, d: 2.2, h: 11, roof: 1 },
    { x: 10.6, y: 1.6, w: 2, d: 2, h: 17, ant: 1 },
    { x: 0.6, y: 4.4, w: 2, d: 2, h: 6, roof: 1 },
    { x: 3.6, y: 3.8, w: 2.2, d: 2.2, h: 12 },
    { x: 8, y: 4.4, w: 1.8, d: 1.8, h: 7 },
    { x: 11, y: 5.4, w: 2, d: 2, h: 9, roof: 1 },
  ],
  stacks: [
    { x: 3.2, y: 8.6, n: 5 },
    { x: 5.6, y: 7.6, n: 8 },
    { x: 7.4, y: 9.4, n: 11 },
    { x: 9.8, y: 8.4, n: 6 },
    { x: 11.8, y: 10.2, n: 9 },
    { x: 5.2, y: 11.4, n: 4 },
    { x: 8.6, y: 12.2, n: 7 },
    { x: 2, y: 11.6, n: 3 },
    { x: 12.6, y: 12.8, n: 5 },
  ],
  kiosks: [
    { x: 1.2, y: 7.6, w: 1.3, d: 0.8, h: 1.7 },
    { x: 6.2, y: 5.2, w: 1.3, d: 0.8, h: 1.7 },
    { x: 10.2, y: 11.4, w: 1.3, d: 0.8, h: 1.7 },
  ],
};

type Pt = [number, number];

function cityRenderer(cv: HTMLCanvasElement) {
  const ctx = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  const TW = 22;
  const TH = 11;
  const TZ = 10;
  const ox = W * 0.5;
  const oy = 142;
  const P = (x: number, y: number, z: number): Pt => [ox + ((x - y) * TW) / 2, oy + ((x + y) * TH) / 2 - z * TZ];
  const poly = (pts: Pt[], fill: string | CanvasGradient) => {
    ctx.beginPath();
    ctx.moveTo(pts[0]![0], pts[0]![1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const vgrad = (y0: number, y1: number, c0: string, c1: string) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    return g;
  };
  type Obj = { k: 't' | 'k' | 's'; o: Box | { x: number; y: number; n: number }; i: number; key: number };
  const objs: Obj[] = [];
  CITY.towers.forEach((t, i) => objs.push({ k: 't', o: t, i, key: t.x + t.w / 2 + t.y + t.d / 2 }));
  CITY.kiosks.forEach((t, i) => objs.push({ k: 'k', o: t, i, key: t.x + t.w / 2 + t.y + t.d / 2 }));
  CITY.stacks.forEach((s, i) => objs.push({ k: 's', o: s, i, key: s.x + s.y }));
  objs.sort((a, b) => a.key - b.key);

  function shadow(b: Box, h: number) {
    const len = Math.min(5, h * 0.32);
    poly([P(b.x + b.w, b.y, 0), P(b.x + b.w + len, b.y + len * 0.15, 0), P(b.x + b.w + len, b.y + b.d + len * 0.15, 0), P(b.x, b.y + b.d, 0), P(b.x + b.w, b.y + b.d, 0)], 'rgba(0,6,16,.38)');
  }
  function box(b: Box, h: number, idx: number, frame: number, kiosk: boolean) {
    const { x, y, w, d } = b;
    const A = P(x, y + d, 0);
    const B = P(x + w, y + d, 0);
    const At = P(x, y + d, h);
    const Bt = P(x + w, y + d, h);
    const Ct = P(x + w, y, h);
    const Dt = P(x, y, h);
    const C = P(x + w, y, 0);
    poly([A, B, Bt, At], vgrad(At[1], A[1], kiosk ? '#7C9FC6' : '#9DBEE2', '#4E739F'));
    poly([B, C, Ct, Bt], vgrad(Ct[1], B[1], kiosk ? '#4A6D98' : '#5679A5', '#22385A'));
    poly([At, Bt, Ct, Dt], '#E3F0FF');
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(At[0], At[1]);
    ctx.lineTo(Bt[0], Bt[1]);
    ctx.lineTo(Ct[0], Ct[1]);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200,225,255,.35)';
    ctx.beginPath();
    ctx.moveTo(Bt[0], Bt[1]);
    ctx.lineTo(B[0], B[1]);
    ctx.stroke();
    if (kiosk) {
      if (h < 1) return;
      poly([P(x + 0.15, y + d, 0.35), P(x + w - 0.15, y + d, 0.35), P(x + w - 0.15, y + d, h - 0.25), P(x + 0.15, y + d, h - 0.25)], '#081A2E');
      ctx.strokeStyle = '#3DDC97';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      [
        [0.2, 0.4],
        [0.4, 0.75],
        [0.6, 0.6],
        [0.8, 1.05],
        [1.05, 0.95],
      ].forEach((pp, j) => {
        const q = P(x + 0.1 + (pp[0]! * (w - 0.2)) / 1.1, y + d, 0.45 + (pp[1]! * (h - 0.8)) / 1.1);
        if (j) ctx.lineTo(q[0], q[1]);
        else ctx.moveTo(q[0], q[1]);
      });
      ctx.stroke();
      return;
    }
    const rr = rng(hash('w' + idx + '-' + frame));
    for (let xa = x + 0.3; xa + 0.3 < x + w - 0.1; xa += 0.55) {
      for (let za = 0.8; za + 0.55 < h - 0.35; za += 1.0) {
        const lit = rr() < 0.11;
        if (lit) poly([P(xa - 0.06, y + d, za - 0.08), P(xa + 0.36, y + d, za - 0.08), P(xa + 0.36, y + d, za + 0.63), P(xa - 0.06, y + d, za + 0.63)], 'rgba(214,235,255,.35)');
        poly([P(xa, y + d, za), P(xa + 0.3, y + d, za), P(xa + 0.3, y + d, za + 0.55), P(xa, y + d, za + 0.55)], lit ? '#FFFFFF' : 'rgba(200,225,255,.55)');
      }
    }
    for (let ya = y + 0.3; ya + 0.3 < y + d - 0.1; ya += 0.55) {
      for (let za = 0.8; za + 0.55 < h - 0.35; za += 1.0) {
        const lit = rr() < 0.08;
        poly([P(x + w, ya, za), P(x + w, ya + 0.3, za), P(x + w, ya + 0.3, za + 0.55), P(x + w, ya, za + 0.55)], lit ? '#CFE6FF' : 'rgba(120,160,210,.45)');
      }
    }
    if (b.roof && h >= b.h * 0.98) {
      const rx = x + w * 0.25;
      const ry = y + d * 0.25;
      const rw = w * 0.5;
      const rd = d * 0.5;
      const rh = 0.9;
      const a = P(rx, ry + rd, h);
      const bb = P(rx + rw, ry + rd, h);
      const c = P(rx + rw, ry, h);
      const at = P(rx, ry + rd, h + rh);
      const bt = P(rx + rw, ry + rd, h + rh);
      const ct = P(rx + rw, ry, h + rh);
      const dt = P(rx, ry, h + rh);
      poly([a, bb, bt, at], '#A9C7E8');
      poly([bb, c, ct, bt], '#5C80AC');
      poly([at, bt, ct, dt], '#F2F8FF');
    }
    if (b.ant && h >= b.h * 0.98) {
      const t = P(x + w / 2, y + d / 2, h);
      ctx.strokeStyle = '#E3F0FF';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(t[0], t[1]);
      ctx.lineTo(t[0], t[1] - 18);
      ctx.stroke();
      const on = frame % 2 === 0;
      ctx.fillStyle = on ? '#3DDC97' : '#9ECFFF';
      ctx.fillRect(t[0] - 1.5, t[1] - 21, 3, 3);
      if (on) {
        ctx.fillStyle = 'rgba(61,220,151,.3)';
        ctx.fillRect(t[0] - 3.5, t[1] - 23, 7, 7);
      }
    }
  }
  function coin(cx: number, cy: number, z: number, rxk: number, top: boolean) {
    const r = 0.85;
    const rx = ((r * TW) / Math.SQRT2) * rxk;
    const ry = (r * TH) / Math.SQRT2;
    const ch = 0.5;
    const [bx, by] = P(cx, cy, z);
    const [tx, ty] = P(cx, cy, z + ch * 0.82);
    const R = Math.max(1, rx);
    ctx.fillStyle = '#4F739D';
    ctx.beginPath();
    ctx.ellipse(bx, by, R, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(bx - R, ty, R * 2, by - ty);
    ctx.fillStyle = 'rgba(190,220,250,.55)';
    ctx.fillRect(bx - R, ty + (by - ty) * 0.2, Math.max(1, R * 0.5), (by - ty) * 0.6);
    ctx.fillStyle = top ? '#EEF6FF' : '#BCD5EE';
    ctx.beginPath();
    ctx.ellipse(tx, ty, R, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    if (top) {
      ctx.strokeStyle = '#5A7EA8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(tx, ty, Math.max(1, R * 0.7), ry * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (rxk > 0.5) {
        ctx.strokeStyle = '#2B6FD0';
        ctx.beginPath();
        ctx.moveTo(tx - R * 0.45, ty + 1.2);
        ctx.lineTo(tx - R * 0.12, ty - 0.8);
        ctx.lineTo(tx + R * 0.1, ty + 0.6);
        ctx.lineTo(tx + R * 0.45, ty - 2.4);
        ctx.stroke();
      }
    }
  }
  function stack(s: { x: number; y: number }, n: number) {
    for (let k = 0; k < n; k++) coin(s.x, s.y, k * 0.5, 1, k === n - 1);
  }
  function holo(t: number) {
    const bob = Math.sin(t * 1.3) * 0.25;
    const x0 = 5.4;
    const y0 = 9.9;
    const z0 = 12.2 + bob;
    const w = 3.6;
    const h = 2.4;
    const q = [P(x0, y0, z0), P(x0 + w, y0, z0), P(x0 + w, y0, z0 + h), P(x0, y0, z0 + h)];
    ctx.strokeStyle = 'rgba(158,207,255,.22)';
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    const a = P(x0 + w * 0.5, y0, z0);
    const b = P(7.4, 9.4, 5.6);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    poly(q, 'rgba(110,170,255,.16)');
    ctx.strokeStyle = 'rgba(214,235,255,.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.stroke();
    poly([P(x0, y0, z0 + h - 0.4), P(x0 + w, y0, z0 + h - 0.4), P(x0 + w, y0, z0 + h), P(x0, y0, z0 + h)], 'rgba(214,235,255,.22)');
    const pts = [
      [0.1, 0.3],
      [0.25, 0.5],
      [0.4, 0.42],
      [0.55, 0.85],
      [0.7, 0.75],
      [0.85, 1.3],
      [0.95, 1.55],
    ];
    ctx.strokeStyle = '#3DDC97';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    pts.forEach((pp, j) => {
      const p = P(x0 + pp[0]! * w, y0, z0 + 0.25 + pp[1]!);
      if (j) ctx.lineTo(p[0], p[1]);
      else ctx.moveTo(p[0], p[1]);
    });
    ctx.stroke();
    const e = P(x0 + 0.95 * w, y0, z0 + 0.25 + 1.55);
    ctx.fillStyle = 'rgba(61,220,151,.35)';
    ctx.fillRect(e[0] - 3, e[1] - 3, 6, 6);
    ctx.fillStyle = '#BFFFE0';
    ctx.fillRect(e[0] - 1, e[1] - 1, 2, 2);
  }
  const pulses = [
    { a: 'x', l: 3.2, s: 0.9, o: 0 },
    { a: 'x', l: 7.1, s: 0.7, o: 5 },
    { a: 'y', l: 6.6, s: 0.8, o: 2 },
    { a: 'y', l: 13.2, s: 1, o: 7 },
    { a: 'x', l: 13.5, s: 0.6, o: 9 },
    { a: 'y', l: 2.6, s: 0.75, o: 4 },
  ];
  return function draw(t: number, rise: number, frame: number) {
    ctx.clearRect(0, 0, W, H);
    const g = [P(0, 0, 0), P(14, 0, 0), P(14, 14, 0), P(0, 14, 0)];
    const fg = ctx.createLinearGradient(0, P(0, 0, 0)[1], 0, P(14, 14, 0)[1]);
    fg.addColorStop(0, 'rgba(120,170,230,.10)');
    fg.addColorStop(1, 'rgba(120,170,230,.03)');
    poly(g, fg);
    ctx.strokeStyle = 'rgba(170,210,250,.14)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 14; i++) {
      let a = P(i, 0, 0);
      let b = P(i, 14, 0);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      a = P(0, i, 0);
      b = P(14, i, 0);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    [
      [2, 9],
      [6, 13],
      [12, 8],
      [9, 6],
      [3, 6],
    ].forEach(([x, y]) => poly([P(x!, y!, 0), P(x! + 1, y!, 0), P(x! + 1, y! + 1, 0), P(x!, y! + 1, 0)], 'rgba(158,207,255,.13)'));
    pulses.forEach((p) => {
      const pos = ((t * p.s + p.o) % 16) - 1;
      for (let k = 0; k < 4; k++) {
        const v = pos - k * 0.22;
        if (v < 0 || v > 14) continue;
        const pt = p.a === 'x' ? P(v, p.l, 0) : P(p.l, v, 0);
        ctx.fillStyle = k ? `rgba(158,207,255,${0.5 - k * 0.12})` : '#EAF5FF';
        ctx.fillRect(Math.round(pt[0]) - 1, Math.round(pt[1]) - 1, k ? 2 : 3, k ? 2 : 3);
      }
    });
    objs.forEach((ob) => {
      if (ob.k === 't') {
        const p = Math.min(1, Math.max(0, (rise - (ob.key / 28) * 0.55) / 0.45));
        const o = ob.o as Box;
        if (p > 0) shadow(o, o.h * (1 - Math.pow(1 - p, 3)));
      }
    });
    objs.forEach((ob) => {
      const p = Math.min(1, Math.max(0, (rise - (ob.key / 28) * 0.55) / 0.45));
      const e = 1 - Math.pow(1 - p, 3);
      if (e <= 0) return;
      if (ob.k === 't') box(ob.o as Box, (ob.o as Box).h * e, ob.i, frame, false);
      else if (ob.k === 'k') box(ob.o as Box, (ob.o as Box).h * e, ob.i, frame, true);
      else {
        const s = ob.o as { x: number; y: number; n: number };
        stack(s, Math.max(1, Math.round(s.n * e)));
      }
    });
    if (rise >= 1.6) {
      const bob = Math.sin(t * 1.8) * 0.35;
      coin(7.4, 9.4, 7.2 + bob, Math.max(0.12, Math.abs(Math.cos(t * 1.4))), true);
      holo(t);
    }
  };
}

export function PixelCity() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !cv.getContext) return;
    const draw = cityRenderer(cv);
    // Reduced motion, or lite mode on low-end phones: one still frame.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('lite')) {
      draw(0, 1.6, 0);
      return;
    }
    let vis = true;
    let io: IntersectionObserver | null = null;
    try {
      io = new IntersectionObserver((es) => {
        vis = !!es[0]?.isIntersecting;
      });
      io.observe(cv);
    } catch {
      // No IntersectionObserver: always draw.
    }
    const t0 = performance.now();
    let last = 0;
    let raf = 0;
    const loop = (ts: number) => {
      // ~24fps cap (42ms per frame), skip work while offscreen or hidden.
      if (ts - last > 42 && vis && !document.hidden) {
        last = ts;
        const t = (ts - t0) / 1000;
        draw(t, Math.min(1.6, (t / 1.7) * 1.6), Math.floor(t / 1.2));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, []);
  return <canvas ref={ref} className="city" width={420} height={330} aria-hidden="true" />;
}
