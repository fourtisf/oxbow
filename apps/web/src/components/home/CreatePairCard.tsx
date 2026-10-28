'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usd } from '@oxbow/shared';
import { useStocks } from '@/lib/api/queries';
import { useCreateForm } from '@/lib/store/create';
import { ArrowIcon, BoltIcon, ChevronIcon, ShieldLgIcon, SwapIcon } from '../ui/Icons';
import { TokenAvatar } from '../ui/TokenAvatar';
import { BracketCorners, Button, cx, Fmt, VerifiedChip } from '../ui/primitives';

/** Home "Create a stock-paired pool" card. Hands off to /create?mint=&quote=. */
export function CreatePairCard() {
  const router = useRouter();
  const { data: stocks = [] } = useStocks();
  const quote = useCreateForm((s) => s.quote);
  const setQuote = useCreateForm((s) => s.setQuote);
  const [mint, setMint] = useState('');
  const [open, setOpen] = useState(false);
  const sel = useRef<HTMLDivElement>(null);
  const cur = stocks.find((s) => s.symbol === quote) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!sel.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = () => {
    const p = new URLSearchParams();
    if (mint.trim()) p.set('mint', mint.trim());
    if (cur) p.set('quote', cur.symbol);
    router.push('/create' + (p.size ? '?' + p.toString() : ''));
  };

  return (
    <div className="card cpair">
      <BracketCorners />
      <div className="ttl">
        <span className="ic">
          <BoltIcon />
        </span>
        Create a stock-paired pool
      </div>
      <div className="cpair-grid">
        <div>
          <label className="fl" htmlFor="hMint">
            Token
          </label>
          <input className="inp" id="hMint" placeholder="Paste a token mint" autoComplete="off" spellCheck={false} value={mint} onChange={(e) => setMint(e.target.value)} />
        </div>
        <div className="swapic" aria-hidden="true">
          <span>
            <SwapIcon />
          </span>
        </div>
        <div className={cx('ssel', open && 'open')} ref={sel}>
          <span className="fl" id="hSelLbl">
            Stock / RWA
          </span>
          <button className="inp ssel-btn" aria-haspopup="listbox" aria-expanded={open} aria-labelledby="hSelLbl hSelPh" onClick={() => setOpen(!open)}>
            <span className="ph" id="hSelPh">
              {cur ? (
                <>
                  <TokenAvatar asset={cur} size={24} />
                  <b className="mono" style={{ color: 'var(--text)' }}>
                    {cur.symbol}
                  </b>
                  <span>{cur.name}</span>
                </>
              ) : (
                'Choose a stock'
              )}
            </span>
            <ChevronIcon className="chev" />
          </button>
          <div className="pop" role="listbox" aria-label="Stocks" aria-hidden={!open}>
            {stocks.map((s) => (
              <button
                key={s.symbol}
                role="option"
                aria-selected={cur?.symbol === s.symbol}
                tabIndex={open ? 0 : -1}
                onClick={() => {
                  setQuote(s.symbol);
                  setOpen(false);
                }}
              >
                <TokenAvatar asset={s} size={34} />
                <span>
                  <b>{s.symbol}</b>
                  <small>{s.name}</small>
                </span>
                <span className="r">
                  <Fmt>{usd(s.priceUsd)}</Fmt>
                  <VerifiedChip />
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="help">
        <ShieldLgIcon size={16} sw={2} />
        Stock tokens come from their issuers. Oxbow checks each one&apos;s price feed and liquidity before you deposit anything.
      </p>
      <Button size="lg" block onClick={go}>
        Create pair <ArrowIcon />
      </Button>
    </div>
  );
}
