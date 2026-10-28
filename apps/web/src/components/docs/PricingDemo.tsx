'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { amt, compact, quoteBuy, signed, usd } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { prefersReducedMotion } from '@/lib/hooks';
import { cx } from '../ui/primitives';

/** Illustrative pool for the demo: 412M MOCHI against 2,140 NVDAx at a 1% fee. */
const H = { x0: 412e6, y0: 2140, f: 0.01, nvdaUsd: 192.6 };
const TARGET = 18;

function wavePath(x: number, amp: number, phase: number) {
  let d = `M${x} 300 L${x} ${(amp * Math.sin(phase)).toFixed(2)}`;
  for (let i = 4; i <= 340; i += 4) d += ` L${x + i} ${(amp * Math.sin((i / 80) * Math.PI * 2 + phase)).toFixed(2)}`;
  return d + ` L${x + 340} 300 Z`;
}
const WAVES = { L1: wavePath(24, 4, 0), L2: wavePath(24, 5, 1.6), R1: wavePath(256, 4, 0.8), R2: wavePath(256, 5, 2.4) };

/** The Docs two-vessel constant-product demo (`heroUpdate` / `demoIntro`). */
export function PricingDemo() {
  const t = useT();
  const [v, setV] = useState(0);
  const touched = useRef(false);

  // Ease the slider to 18% once, unless the reader grabs it first.
  useEffect(() => {
    if (prefersReducedMotion()) {
      setV(TARGET);
      return;
    }
    let raf = 0;
    let t0: number | null = null;
    const step = (ts: number) => {
      if (touched.current) return;
      if (t0 === null) t0 = ts;
      const k = Math.min(1, (ts - t0) / 1500);
      setV(Math.round(TARGET * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    const t = setTimeout(() => (raf = requestAnimationFrame(step)), 400);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, []);

  const dy = (v / 100) * 0.6 * H.y0;
  const q = quoteBuy({ base: H.x0, quote: H.y0 }, dy, H.f);
  const x1 = q.after.base;
  const y1 = q.after.quote;
  const fL = Math.max(0.06, (0.5 * x1) / H.x0);
  const fR = Math.min(0.95, (0.5 * y1) / H.y0);

  return (
    <div className="demo">
      <div>
        <svg viewBox="0 0 440 236" role="img" aria-label={t.docs.demoAria}>
          <defs>
            <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#E2F0FF" />
              <stop offset="1" stopColor="#3E6EA6" />
            </linearGradient>
            <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#A6F3CB" />
              <stop offset="1" stopColor="#16804B" />
            </linearGradient>
            <clipPath id="cL">
              <rect x="24" y="10" width="160" height="212" rx="22" />
            </clipPath>
            <clipPath id="cR">
              <rect x="256" y="10" width="160" height="212" rx="22" />
            </clipPath>
          </defs>
          <line className="pipe" x1="184" y1="200" x2="256" y2="200" />
          <line className={cx('pipe-flow', v > 0 && 'on')} x1="190" y1="200" x2="250" y2="200" />
          <rect className="glass" x="24" y="10" width="160" height="212" rx="22" />
          <rect className="glass" x="256" y="10" width="160" height="212" rx="22" />
          <g clipPath="url(#cL)">
            <g className="liq" style={{ transform: `translateY(${10 + 212 * (1 - fL)}px)` }}>
              <path className="wave back" fill="url(#gT)" opacity=".4" d={WAVES.L2} />
              <path className="wave" fill="url(#gT)" d={WAVES.L1} />
            </g>
          </g>
          <g clipPath="url(#cR)">
            <g className="liq" style={{ transform: `translateY(${10 + 212 * (1 - fR)}px)` }}>
              <path className="wave back" fill="url(#gI)" opacity=".4" d={WAVES.R2} />
              <path className="wave" fill="url(#gI)" d={WAVES.R1} />
            </g>
          </g>
          <line className="startline" x1="30" y1="116" x2="178" y2="116" />
          <line className="startline" x1="262" y1="116" x2="410" y2="116" />
          <rect className="glass-edge" x="24" y="10" width="160" height="212" rx="22" />
          <rect className="glass-edge" x="256" y="10" width="160" height="212" rx="22" />
          <text x="220" y="62" textAnchor="middle" className="eq">
            x·y=k
          </text>
          <text x="220" y="120" textAnchor="middle" className="vlabel">
            START
          </text>
        </svg>
        <div className="reserves">
          <div>
            <span>{t.docs.inPool('MOCHI')}</span>
            <strong>{compact(x1, 1)}</strong>
          </div>
          <div>
            <span>{t.docs.inPool('NVDAx')}</span>
            <strong>{amt(y1)}</strong>
          </div>
        </div>
      </div>
      <div>
        <label htmlFor="heroRange">
          <span>{t.docs.buyWith}</span>
          <b>{amt(dy)} NVDAx</b>
        </label>
        <input
          className="range"
          id="heroRange"
          type="range"
          min={0}
          max={100}
          step={1}
          value={v}
          style={{ '--p': v + '%' } as CSSProperties}
          onChange={(e) => {
            touched.current = true;
            setV(+e.target.value);
          }}
        />
        <div className="readouts">
          <div>
            <span>{t.docs.youGet}</span>
            <strong>{amt(q.out)} MOCHI</strong>
          </div>
          <div>
            <span>{t.docs.priceMoves}</span>
            <strong className="up">{signed(q.impactPct)}</strong>
          </div>
          <div>
            <span>{t.docs.paidIn}</span>
            <strong>{usd(dy * H.nvdaUsd)}</strong>
          </div>
          <div>
            <span>{t.docs.lpsEarn}</span>
            <strong>{amt(q.fee)} NVDAx</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
