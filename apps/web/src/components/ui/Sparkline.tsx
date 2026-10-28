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
