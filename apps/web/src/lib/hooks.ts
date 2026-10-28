'use client';

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/**
 * False during SSR and hydration, true afterwards (and immediately for
 * components mounted later). For output that can only be computed in the
 * browser, such as canvas avatars.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

const RM = '(prefers-reduced-motion: reduce)';

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(RM);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(RM).matches,
    () => false,
  );
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia(RM).matches;

export const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

let locks = 0;
/** Adds `body.locked` (no page scroll) while any overlay that uses this is open. */
export function useBodyLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    locks++;
    document.body.classList.add('locked');
    return () => {
      locks = Math.max(0, locks - 1);
      if (!locks) document.body.classList.remove('locked');
    };
  }, [active]);
}

const counted = new Set<string>();
/**
 * The prototype's count-up: eases from 0 to `to` over 1.3s the first time a
 * given `key` mounts, then shows values directly. Renders 0 during SSR so the
 * first paint doesn't flash the final value before counting.
 */
export function useCountUp(key: string, to: number): number {
  const [frac, setFrac] = useState(() => (counted.has(key) ? 1 : 0));
  useIsoLayoutEffect(() => {
    if (counted.has(key) || prefersReducedMotion()) {
      counted.add(key);
      setFrac(1);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (ts: number) => {
      const k = Math.min(1, (ts - t0) / 1300);
      setFrac(1 - Math.pow(1 - k, 4));
      if (k < 1) raf = requestAnimationFrame(step);
      else counted.add(key);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [key]);
  return to * frac;
}

/** Re-render on an interval (for relative times). */
export function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** True once the element has been on screen. */
export function useInView<T extends Element>(ref: React.RefObject<T>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) setSeen(true);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
}

/** `value`, updated only after it stops changing for `ms`. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
