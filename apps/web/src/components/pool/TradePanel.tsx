'use client';

import { useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { amt, feeRateFromBps, matchDeposit, num, pct, quoteBuy, signed, usd, type PoolDetail } from '@oxbow/shared';
import { invalidateAfterTx } from '@/lib/api/queries';
import { chain } from '@/lib/chain/mock';
import { useBalances } from '@/lib/chain/hooks';
import { toast } from '@/lib/store/toast';
import { useWallet } from '@/lib/store/wallet';
import { TokenAvatar } from '../ui/TokenAvatar';
import { Button, Fmt } from '../ui/primitives';

export type TradeTab = 'swap' | 'add';

const cleanNum = (v: string) => v.replace(/[^0-9.,]/g, '');

/** Swap / Add liquidity box in the pool drawer (`renderTrade`). */
export function TradePanel({ pool, tab, onTab }: { pool: PoolDetail; tab: TradeTab; onTab: (t: TradeTab) => void }) {
  const id = useId();
  return (
    <div className="trade">
      <div className="ttabs" role="tablist" aria-label="Trade">
        {(['swap', 'add'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            id={`${id}-${t}`}
            aria-selected={tab === t}
            aria-controls={`${id}-panel`}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => onTab(t)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                const next = t === 'swap' ? 'add' : 'swap';
                onTab(next);
                document.getElementById(`${id}-${next}`)?.focus();
              }
            }}
          >
            {t === 'swap' ? 'Swap' : 'Add liquidity'}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`}>
        {tab === 'swap' ? <Swap pool={pool} /> : <AddLiquidity pool={pool} />}
      </div>
    </div>
  );
}

function Swap({ pool }: { pool: PoolDetail }) {
  const { wallet, open } = useWallet();
  const bal = useBalances([pool.quote.mint]);
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const q = pool.quote;
  const dy = num(v);
  const quote = quoteBuy({ base: pool.reserveBase, quote: pool.reserveQuote }, dy, feeRateFromBps(pool.feeBps));
  const have = bal.get(q.mint);

  const submit = async () => {
    if (!wallet) return open();
    if (!dy) return document.getElementById('swIn')?.focus();
    if (dy > have) return toast(`You only have ${amt(have)} ${q.symbol}`);
    setBusy(true);
    try {
      await chain.swap(wallet.address, pool.address, dy);
      toast(`Swapped ${amt(dy)} ${q.symbol} for ${amt(quote.out)} ${pool.base.symbol}`);
      setV('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="tfield">
        <div className="tl">
          <span>You pay</span>
          <span>{wallet ? `Balance: ${amt(have)} ${q.symbol}` : ''}</span>
        </div>
        <div className="row">
          <input id="swIn" inputMode="decimal" placeholder="0" aria-label={`Amount to pay in ${q.symbol}`} value={v} onChange={(e) => setV(cleanNum(e.target.value))} autoComplete="off" />
          <span className="tok">
            <TokenAvatar asset={q} size={24} />
            {q.symbol}
          </span>
        </div>
      </div>
      <div className="tfield">
        <div className="tl">
          <span>You get</span>
          <span>{quote.out ? '≈ ' + usd(dy * q.priceUsd) : ''}</span>
        </div>
        <div className="row">
          <span className="out" aria-live="polite">
            {quote.out ? <Fmt>{amt(quote.out)}</Fmt> : '0'}
          </span>
          <span className="tok">
            <TokenAvatar asset={pool.base} size={24} />
            {pool.base.symbol}
          </span>
        </div>
      </div>
      <div className="tmeta">
        <div>
          <span>Price impact</span>
          <b style={quote.impactPct > 15 ? { color: 'var(--down)' } : undefined}>{dy ? signed(quote.impactPct) : '0%'}</b>
        </div>
        <div>
          <span>Fee to liquidity providers</span>
          <b>
            <Fmt>{amt(quote.fee)}</Fmt> {q.symbol}
          </b>
        </div>
      </div>
      <Button block onClick={submit} disabled={busy}>
        {wallet ? 'Swap' : 'Select wallet to swap'}
      </Button>
    </>
  );
}

function AddLiquidity({ pool }: { pool: PoolDetail }) {
  const { wallet, open } = useWallet();
  const qc = useQueryClient();
  const bal = useBalances([pool.quote.mint]);
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const q = pool.quote;
  const b = num(v);
  const { quoteIn, sharePct } = matchDeposit({ base: pool.reserveBase, quote: pool.reserveQuote }, b);
  const have = bal.get(q.mint);

  const submit = async () => {
    if (!wallet) return open();
    if (!b) return document.getElementById('adB')?.focus();
    if (quoteIn > have) return toast(`That needs ${amt(quoteIn)} ${q.symbol}. You have ${amt(have)}.`);
    setBusy(true);
    try {
      await chain.addLiquidity(wallet.address, pool.address, b);
      toast(`Added liquidity to ${pool.base.symbol}/${q.symbol}`);
      setV('');
      await invalidateAfterTx(qc);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="tfield">
        <div className="tl">
          <span>{pool.base.symbol}</span>
          <span />
        </div>
        <div className="row">
          <input id="adB" inputMode="decimal" placeholder="0" aria-label={`Amount of ${pool.base.symbol}`} value={v} onChange={(e) => setV(cleanNum(e.target.value))} autoComplete="off" />
          <span className="tok">
            <TokenAvatar asset={pool.base} size={24} />
            {pool.base.symbol}
          </span>
        </div>
      </div>
      <div className="tfield">
        <div className="tl">
          <span>{q.symbol}, matched to the pool&apos;s ratio</span>
          <span>{wallet ? `Balance: ${amt(have)}` : ''}</span>
        </div>
        <div className="row">
          <span className="out">{quoteIn ? <Fmt>{amt(quoteIn)}</Fmt> : '0'}</span>
          <span className="tok">
            <TokenAvatar asset={q} size={24} />
            {q.symbol}
          </span>
        </div>
      </div>
      <div className="tmeta">
        <div>
          <span>Your share of the pool</span>
          <b>{pct(sharePct)}</b>
        </div>
        <div>
          <span>Value deposited</span>
          <b>
            <Fmt>{usd(quoteIn * q.priceUsd * 2)}</Fmt>
          </b>
        </div>
        <div>
          <span>Your deposit</span>
          <b>Withdraw any time</b>
        </div>
      </div>
      <Button block onClick={submit} disabled={busy}>
        {wallet ? 'Add liquidity' : 'Select wallet to add liquidity'}
      </Button>
    </>
  );
}
