'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useBodyLock, useHydrated } from '@/lib/hooks';
import { cx, BracketCorners } from './primitives';

/**
 * Mount/unmount with the prototype's CSS transitions: mounted without `.on`,
 * `.on` added on the next frame, removed `ms` before unmounting.
 */
export function usePresence(open: boolean, ms: number) {
  const [mounted, setMounted] = useState(open);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      let r2 = 0;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setOn(true));
      });
      return () => {
        cancelAnimationFrame(r1);
        cancelAnimationFrame(r2);
      };
    }
    setOn(false);
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [open, ms]);
  return { mounted: mounted || open, on: on && open };
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

/**
 * Dialog focus handling: focus the first control on open (like the prototype),
 * keep Tab inside, restore focus to the opener on close.
 */
export function useDialogFocus(ref: RefObject<HTMLElement>, active: boolean, initial?: string) {
  useEffect(() => {
    if (!active) return;
    const opener = document.activeElement as HTMLElement | null;
    // Controls inherit `visibility` through `transition: all` (e.g. .icon-btn), so right
    // after opening they can still compute as hidden and focus() is ignored. Retry briefly.
    let tries = 0;
    let t: ReturnType<typeof setTimeout>;
    const attempt = () => {
      const el = ref.current;
      const first = (initial && el?.querySelector<HTMLElement>(initial)) || el?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
      if (first && document.activeElement !== first && ++tries < 12) t = setTimeout(attempt, 40);
    };
    t = setTimeout(attempt, 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!ref.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      if (opener && document.body.contains(opener)) opener.focus();
    };
  }, [active, ref, initial]);
}

export function useEscape(active: boolean, onEscape: () => void) {
  const cb = useRef(onEscape);
  cb.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cb.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);
}

export function Portal({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  return hydrated ? createPortal(children, document.body) : null;
}

/** The prototype's `.modal` dialog. While `busy`, Escape and backdrop clicks don't close it. */
export function Modal({ open, onClose, label, busy, children }: { open: boolean; onClose: () => void; label: string; busy?: boolean; children: ReactNode }) {
  const { mounted, on } = usePresence(open, 250);
  const card = useRef<HTMLDivElement>(null);
  useBodyLock(open);
  useDialogFocus(card, open);
  useEscape(open, () => {
    if (!busy) onClose();
  });
  if (!mounted) return null;
  return (
    <Portal>
      <div
        className={cx('modal', on && 'on')}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onClose();
        }}
      >
        <div className="card modal-card" ref={card}>
          <BracketCorners />
          {children}
        </div>
      </div>
    </Portal>
  );
}
