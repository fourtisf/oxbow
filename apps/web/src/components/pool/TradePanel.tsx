'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { amt, feePct, feeRateFromBps, matchDeposit, num, pct, quoteBuy, quoteSell, signed, usd, type PoolDetail, type TradeSide } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { track } from '@/lib/analytics';
import { invalidateAfterTx } from '@/lib/api/queries';
import { useBalances } from '@/lib/chain/hooks';
import { chain } from '@/lib/chain/mock';
import { ChainError } from '@/lib/chain/types';
import { links } from '@/lib/links';
import { toast } from '@/lib/store/toast';
import { HIGH_SLIPPAGE_BPS, SLIPPAGE_PRESETS_BPS, useTradeSettings } from '@/lib/store/trade';
import { useWallet } from '@/lib/store/wallet';
import { ExternalIcon, FlipIcon, GearIcon } from '../ui/Icons';
import { TokenAvatar } from '../ui/TokenAvatar';
import { Button, cx, Fmt } from '../ui/primitives';

export type TradeTab = 'swap' | 'add';

const cleanNum = (v: string) => v.replace(/[^0-9.,]/g, '');

/** Swap / Add liquidity box in the pool drawer (`renderTrade`), with buy and sell. */
export function TradePanel({ pool, tab, onTab }: { pool: PoolDetail; tab: TradeTab; onTab: (t: TradeTab) => void }) {
  const t = useT();
  const id = useId();
  const [settings, setSettings] = useState(false);
  return (
    <div className="trade">
      <div className="trade-h">
        <div className="ttabs" role="tablist" aria-label={t.trade.tabs}>
          {(['swap', 'add'] as const).map((k) => (
            <button
              key={k}
              role="tab"
              id={`${id}-${k}`}
              aria-selected={tab === k}
              aria-controls={`${id}-panel`}
              tabIndex={tab === k ? 0 : -1}
              onClick={() => onTab(k)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  const next = k === 'swap' ? 'add' : 'swap';
                  onTab(next);
                  document.getElementById(`${id}-${next}`)?.focus();
                }
              }}
            >
              {k === 'swap' ? t.trade.swap : t.trade.add}
            </button>
          ))}
        </div>
        {tab === 'swap' && (
          <button className="icon-btn gear" aria-label={t.trade.slippage} aria-expanded={settings} aria-controls={`${id}-slip`} onClick={() => setSettings(!settings)}>
            <GearIcon />
          </button>
        )}
      </div>
      {tab === 'swap' && settings && <SlippageSettings id={`${id}-slip`} />}
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`}>
        {tab === 'swap' ? <Swap pool={pool} /> : <AddLiquidity pool={pool} />}
      </div>
    </div>
  );
}

function SlippageSettings({ id }: { id: string }) {
  const t = useT();
  const { slippageBps, set } = useTradeSettings();
  const preset = (SLIPPAGE_PRESETS_BPS as readonly number[]).includes(slippageBps);
  const [custom, setCustom] = useState(preset ? '' : String(slippageBps / 100));
  return (
    <div className="slip" id={id}>
      <span className="flabel">
        <b>{t.trade.slippage}</b>
      </span>
      <div className="chips" role="group" aria-label={t.trade.slippage}>
        {SLIPPAGE_PRESETS_BPS.map((b) => (
          <button
            key={b}
            className="chip"
            aria-pressed={slippageBps === b}
            onClick={() => {
              set(b);
              setCustom('');
            }}
          >
            {feePct(b)}
          </button>
        ))}
        <label className="slip-custom">
          <input
            inputMode="decimal"
            placeholder="%"
            aria-label={t.trade.slippageCustom}
            value={custom}
            onChange={(e) => {
              const v = cleanNum(e.target.value);
              setCustom(v);
              const n = num(v);
              if (n > 0) set(n * 100);
            }}
          />
          %
        </label>
      </div>
      {slippageBps > HIGH_SLIPPAGE_BPS && <p className="err">{t.trade.slippageHigh}</p>}
    </div>
  );
}

function Swap({ pool }: { pool: PoolDetail }) {
  const t = useT();
  const qc = useQueryClient();
  const { wallet, open } = useWallet();
  const slippageBps = useTradeSettings((s) => s.slippageBps);
  const bal = useBalances([pool.quote.mint, pool.base.mint]);
  const [side, setSide] = useState<TradeSide>('BUY');
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const pay = side === 'BUY' ? pool.quote : pool.base;
  const get = side === 'BUY' ? pool.base : pool.quote;
  const amountIn = num(v);
  const r = { base: pool.reserveBase, quote: pool.reserveQuote };
  const fee = feeRateFromBps(pool.feeBps);
  const quote = side === 'BUY' ? quoteBuy(r, amountIn, fee) : quoteSell(r, amountIn, fee);
  const minOut = quote.out * (1 - slippageBps / 10_000);
  const have = bal.get(pay.mint);
  const payUsd = side === 'BUY' ? amountIn * pool.quote.priceUsd : quote.out * pool.quote.priceUsd;

  const switchSide = (s: TradeSide) => {
    setSide(s);
    setV('');
  };

  const submit = async () => {
    if (!wallet) return open();
    if (!amountIn) return document.getElementById('swIn')?.focus();
    if (amountIn > have) return toast(t.trade.onlyHave(amt(have), pay.symbol));
    setBusy(true);
    try {
      const res = await chain.swap(wallet.address, pool.address, { side, amountIn, minOut });
      toast(t.trade.swapped(amt(amountIn), pay.symbol, amt(res.out), get.symbol));
      track('swap', { side });
      setV('');
      await invalidateAfterTx(qc);
    } catch (e) {
      toast(e instanceof ChainError && e.code === 'SLIPPAGE' ? t.trade.slippageFail(feePct(slippageBps)) : t.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="bsseg" role="group" aria-label={t.trade.direction}>
        <button className="b" aria-pressed={side === 'BUY'} onClick={() => switchSide('BUY')}>
          {t.trade.buy} {pool.base.symbol}
        </button>
        <button className="s" aria-pressed={side === 'SELL'} onClick={() => switchSide('SELL')}>
          {t.trade.sell} {pool.base.symbol}
        </button>
      </div>
      <div className="tfield">
        <div className="tl">
          <span>{t.trade.youPay}</span>
          <span>
            {wallet && (
              <>
                {t.trade.balance(amt(have), pay.symbol)}{' '}
                <button type="button" className="maxbtn" onClick={() => setV(String(have))}>
                  {t.trade.max}
                </button>
              </>
            )}
          </span>
        </div>
        <div className="row">
          <input id="swIn" inputMode="decimal" placeholder="0" aria-label={t.trade.payAria(pay.symbol)} value={v} onChange={(e) => setV(cleanNum(e.target.value))} autoComplete="off" />
          <span className="tok">
            <TokenAvatar asset={pay} size={24} />
            {pay.symbol}
          </span>
        </div>
        {wallet && have === 0 && side === 'BUY' && (
          <a className="getlink" href={links.buy(pay.mint)} target="_blank" rel="noopener noreferrer">
            {t.trade.getToken(pay.symbol)} <ExternalIcon />
          </a>
        )}
      </div>
      <button className="flip" aria-label={t.trade.flip} onClick={() => switchSide(side === 'BUY' ? 'SELL' : 'BUY')}>
        <FlipIcon />
      </button>
      <div className="tfield">
        <div className="tl">
          <span>{t.trade.youGet}</span>
          <span>{quote.out ? '≈ ' + usd(payUsd) : ''}</span>
        </div>
        <div className="row">
          <span className="out" aria-live="polite">
            {quote.out ? <Fmt>{amt(quote.out)}</Fmt> : '0'}
          </span>
          <span className="tok">
            <TokenAvatar asset={get} size={24} />
            {get.symbol}
          </span>
        </div>
      </div>
      <div className="tmeta">
        <div>
          <span>{t.trade.impact}</span>
          <b style={Math.abs(quote.impactPct) > 15 ? { color: 'var(--down)' } : undefined}>{amountIn ? signed(quote.impactPct) : '0%'}</b>
        </div>
        <div>
          <span>{t.trade.lpFee}</span>
          <b>
            <Fmt>{amt(quote.fee)}</Fmt> {pay.symbol}
          </b>
        </div>
        <div>
          <span>
            {t.trade.minReceived} ({feePct(slippageBps)})
          </span>
          <b>
            <Fmt>{amt(minOut)}</Fmt> {get.symbol}
          </b>
        </div>
      </div>
      <Button block onClick={submit} disabled={busy} className={cx(side === 'SELL' && wallet && 'sellbtn')}>
        {wallet ? `${side === 'BUY' ? t.trade.buy : t.trade.sell} ${pool.base.symbol}` : t.trade.selectToSwap}
      </Button>
    </>
  );
}

function AddLiquidity({ pool }: { pool: PoolDetail }) {
  const t = useT();
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
    if (quoteIn > have) return toast(t.trade.needs(amt(quoteIn), q.symbol, amt(have)));
    setBusy(true);
    try {
      await chain.addLiquidity(wallet.address, pool.address, b);
      toast(t.trade.added(`${pool.base.symbol}/${q.symbol}`));
      track('liquidity_added');
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
          <input id="adB" inputMode="decimal" placeholder="0" aria-label={t.trade.baseAria(pool.base.symbol)} value={v} onChange={(e) => setV(cleanNum(e.target.value))} autoComplete="off" />
          <span className="tok">
            <TokenAvatar asset={pool.base} size={24} />
            {pool.base.symbol}
          </span>
        </div>
      </div>
      <div className="tfield">
        <div className="tl">
          <span>{t.trade.matched(q.symbol)}</span>
          <span>{wallet ? t.trade.balance(amt(have), '') : ''}</span>
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
          <span>{t.trade.share}</span>
          <b>{pct(sharePct)}</b>
        </div>
        <div>
          <span>{t.trade.value}</span>
          <b>
            <Fmt>{usd(quoteIn * q.priceUsd * 2)}</Fmt>
          </b>
        </div>
        <div>
          <span>{t.trade.yourDeposit}</span>
          <b>{t.trade.withdrawAny}</b>
        </div>
      </div>
      <p className="ilnote">
        {t.trade.ilNote}{' '}
        <Link href="/docs#d-risks" className="link" style={{ marginTop: 0 }}>
          {t.trade.ilLink}
        </Link>
      </p>
      <Button block onClick={submit} disabled={busy}>
        {wallet ? t.trade.addBtn : t.trade.selectToAdd}
      </Button>
    </>
  );
}
