'use client';

import { useEffect, useState } from 'react';
import { useToasts, type ToastItem } from '@/lib/store/toast';
import { CheckIcon } from './Icons';

function Toast({ t }: { t: ToastItem }) {
  const remove = useToasts((s) => s.remove);
  const [on, setOn] = useState(false);
  useEffect(() => {
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setOn(true));
    });
    const hide = setTimeout(() => setOn(false), 3200);
    const drop = setTimeout(() => remove(t.id), 3500);
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      clearTimeout(hide);
      clearTimeout(drop);
    };
  }, [t.id, remove]);
  return (
    <div className={'toast' + (on ? ' on' : '')} role="status">
      <CheckIcon />
      <span>{t.msg}</span>
    </div>
  );
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} t={t} />
      ))}
    </div>
  );
}
