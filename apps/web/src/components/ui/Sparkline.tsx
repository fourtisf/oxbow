'use client';

import { useId, useState, type ReactNode, type SVGProps } from 'react';

export interface SparkOptions {
  pad?: number;
  color?: string;
  area?: boolean;
  grid?: boolean;
  dot?: boolean;
  /** Area gradient opacity. */
  op?: number;
  /** Stroke width. */
  sw?: number;
  /** Fixed pixel size; otherwise CSS sizes the SVG. */
  w?: number;
  h?: number;
}

/** The prototype's `spark()` as a component. */
export function Sparkline({
  data,
  W,
  H,
  pad = 4,
  color,
  area = true,
  grid = false,
  dot = false,
  op = 0.28,
  sw = 2,
  w,
  h,
  children,
  ...svg
}: SparkOptions & { data: number[]; W: number; H: number; children?: ReactNode } & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>) {
  const gid = 'g' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const box = { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': true, width: w, height: h } as const;
  if (data.length < 2) return <svg {...box} {...svg} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const sx = (i: number) => (i / (data.length - 1)) * W;
  const sy = (v: number) => pad + (1 - (v - min) / (max - min || 1)) * (H - pad * 2);
  let d = '';
  data.forEach((v, i) => {
    d += (i ? 'L' : 'M') + sx(i).toFixed(1) + ' ' + sy(v).toFixed(1);
  });
  const up = data[data.length - 1]! >= data[0]!;
  const c = color || (up ? '#3DDC97' : '#FF5A6E');
  const ex = sx(data.length - 1);
  const ey = sy(data[data.length - 1]!);
  return (
    <svg {...box} {...svg}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity={op} />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid &&
        [0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgba(170,205,240,.07)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        ))}
      {area && <path d={`${d} L${W} ${H} L0 ${H} Z`} fill={`url(#${gid})`} />}
      <path d={d} fill="none" stroke={c} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {dot && (
        <>
          <circle cx={ex} cy={ey} r="9" fill={c} opacity=".18" />
          <circle cx={ex} cy={ey} r="4" fill={c} />
        </>
      )}
      {children}
    </svg>
  );
}

/**
 * Price chart with the hover crosshair from the drawer (`drawChart`).
 * `onHover` receives the hovered point index, or null when the pointer leaves.
 */
export function PriceChart({ data, W = 520, H = 180, onHover }: { data: number[]; W?: number; H?: number; onHover?: (i: number | null) => void }) {
  const [hi, setHi] = useState<number | null>(null);
  const min = data.length ? Math.min(...data) : 0;
  const max = data.length ? Math.max(...data) : 0;
  const x = hi == null || data.length < 2 ? 0 : (hi / (data.length - 1)) * W;
  const y = hi == null ? 0 : 4 + (1 - (data[hi]! - min) / (max - min || 1)) * (H - 8);
  const set = (i: number | null) => {
    setHi(i);
    onHover?.(i);
  };
  return (
    <Sparkline
      data={data}
      W={W}
      H={H}
      grid
      dot
      op={0.3}
      sw={2.2}
      onPointerMove={(e) => {
        if (data.length < 2) return;
        const r = e.currentTarget.getBoundingClientRect();
        set(Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (data.length - 1)));
      }}
      onPointerLeave={() => set(null)}
    >
      <line x1={x} x2={x} y1="0" y2={H} stroke="rgba(241,246,255,.35)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" opacity={hi == null ? 0 : 1} />
      <circle cx={x} cy={y} r="4.5" fill="#F1F6FF" stroke="#0D1A2B" strokeWidth="2" opacity={hi == null ? 0 : 1} />
    </Sparkline>
  );
}

export interface CandleDatum {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/**
 * Candlestick chart with volume bars, same frame and hover behaviour as
 * PriceChart. Colors follow the prototype's up/down tokens.
 */
export function CandleChart({ candles, W = 520, H = 180, onHover }: { candles: CandleDatum[]; W?: number; H?: number; onHover?: (i: number | null) => void }) {
  const [hi, setHi] = useState<number | null>(null);
  const box = { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': true } as const;
  if (candles.length < 2) return <svg {...box} />;
  const volH = H * 0.2;
  const top = 4;
  const bottom = H - volH - 6;
  const lo = Math.min(...candles.map((c) => c.l));
  const hiP = Math.max(...candles.map((c) => c.h));
  const maxV = Math.max(1e-12, ...candles.map((c) => c.v));
  const step = W / candles.length;
  const bw = Math.max(1, step * 0.62);
  const y = (v: number) => top + (1 - (v - lo) / (hiP - lo || 1)) * (bottom - top);
  const set = (i: number | null) => {
    setHi(i);
    onHover?.(i);
  };
  const cx = (i: number) => i * step + step / 2;
  return (
    <svg
      {...box}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        set(Math.min(candles.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * candles.length))));
      }}
      onPointerLeave={() => set(null)}
    >
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={W} y1={top + (bottom - top) * f} y2={top + (bottom - top) * f} stroke="rgba(170,205,240,.07)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
      ))}
      {candles.map((c, i) => {
        const up = c.c >= c.o;
        const col = up ? '#3DDC97' : '#FF5A6E';
        const yo = y(c.o);
        const yc = y(c.c);
        const vh = (c.v / maxV) * volH;
        return (
          <g key={i} className="cnd" opacity={hi == null || hi === i ? 1 : 0.55}>
            <rect x={cx(i) - bw / 2} y={H - vh} width={bw} height={vh} fill={col} opacity=".28" />
            <line x1={cx(i)} x2={cx(i)} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <rect x={cx(i) - bw / 2} y={Math.min(yo, yc)} width={bw} height={Math.max(1, Math.abs(yc - yo))} fill={col} />
          </g>
        );
      })}
      {hi != null && <line x1={cx(hi)} x2={cx(hi)} y1="0" y2={H} stroke="rgba(241,246,255,.35)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}
