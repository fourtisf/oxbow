'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { amt, SOL_MINT, usd, type LimitOrder, type TokenBrief, type TradeSide } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { track } from '@/lib/analytics';
import { qk } from '@/lib/api/keys';
import { useLimitOrders, useToken } from '@/lib/api/queries';
import { links } from '@/lib/links';
import { toast } from '@/lib/store/toast';
import { useWallet } from '@/lib/store/wallet';
import { cancelLimit, fromRaw, getBalances, placeLimit, TradeError, toRaw, type TradeErrorCode } from '@/lib/trade';
import { CheckIcon, ExternalIcon, WarnIcon } from '../ui/Icons';
import { Button, cx, Fmt } from '../ui/primitives';

const SOL_DECIMALS = 9;
const EXPIRIES = { never: 0, d1: 86_400, d7: 7 * 86_400, d30: 30 * 86_400 } as const;
type Expiry = keyof typeof EXPIRIES;
const BUY_STEPS = [-10, -25, -50];
const SELL_STEPS = [25, 50, 100];

/** A number as the amount boxes show it: plain digits, no exponent. */
const plain = (n: number, d: number) => (n > 0 && Number.isFinite(n) ? n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: Math.min(d, 9) }) : '');
/** USD prices for the price box: enough significant digits for memecoins. */
const priceStr = (n: number) => (n > 0 ? String(Number(n.toPrecision(6))) : '');

function OpenOrders({ token }: { token: TokenBrief }) {
  const t = useT();
  const qc = useQueryClient();
  const wallet = useWallet((s) => s.wallet);
  const { data = [] } = useLimitOrders(wallet?.address);
  const [busy, setBusy] = useState<string | null>(null);
  const mine = data.filter((o) => o.inputMint === token.mint || o.outputMint === token.mint);
  if (!wallet) return null;
  const describe = (o: LimitOrder) => {
    const buy = o.inputMint === SOL_MINT;
    const tokens = fromRaw(buy ? o.takingAmount : o.makingAmount, token.decimals);
    const sol = fromRaw(buy ? o.makingAmount : o.takingAmount, SOL_DECIMALS);
    const at = `${amt(sol / tokens)} SOL`;
    return buy ? t.trade.orderBuy(amt(tokens), token.symbol, at) : t.trade.orderSell(amt(tokens), token.symbol, at);
  };
  return (
    <div className="orders">
      <h3 className="label">{t.trade.openOrders}</h3>
      {mine.length ? (
        <ul>
          {mine.map((o) => (
            <li key={o.order}>
              <span className="mono">
                <Fmt>{describe(o)}</Fmt>
              </span>
              <Button
                variant="glass"
                size="sm"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(o.order);
                  try {
                    await cancelLimit(wallet, o.order);
                    toast(t.trade.cancelled);
                    await qc.invalidateQueries({ queryKey: qk.limitOrders(wallet.address) });
                  } catch (e) {
                    toast(t.trade.errors[e instanceof TradeError ? e.code : 'FAILED']);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === o.order ? <span className="spin" /> : t.trade.cancel}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="fine">{t.trade.noOrders}</p>
      )}
    </div>
  );
}

/** Limit order: an amount, a target price in USD, an expiry. Jupiter fills it on chain when the price gets there. */
export function LimitForm({ token, side, onBusy }: { token: TokenBrief; side: TradeSide; onBusy: (b: boolean) => void }) {
  const t = useT();
  const qc = useQueryClient();
  const wallet = useWallet((s) => s.wallet);
  const openWallet = useWallet((s) => s.open);
  const { data: detail } = useToken(token.mint);
  const buy = side === 'BUY';
  const nowPrice = detail?.usdPrice ?? null;
  const solUsd = detail?.solUsd ?? null;
  const [input, setInput] = useState('');
  const [price, setPrice] = useState('');
  const [expiry, setExpiry] = useState<Expiry>('never');
  const [step, setStep] = useState<number | null>(null);
  const [error, setError] = useState<{ code: TradeErrorCode; detail: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const mints = [SOL_MINT, token.mint];
  const balances = useQuery({ queryKey: qk.balances(wallet?.address ?? '', mints), queryFn: () => getBalances(wallet!.address, mints), enabled: !!wallet, staleTime: 15_000 });
  const inDec = buy ? SOL_DECIMALS : token.decimals;
  const outDec = buy ? token.decimals : SOL_DECIMALS;
  const balIn = balances.data?.[buy ? SOL_MINT : token.mint] ?? null;

  useEffect(() => onBusy(step !== null), [step, onBusy]);
  // Start the target a step away from the current price.
  useEffect(() => {
    if (nowPrice && !price) setPrice(priceStr(nowPrice * (buy ? 0.9 : 1.25)));
  }, [nowPrice, buy, price]);

  const amount = Number(input || 0);
  const target = Number(price || 0);
  // Buy: SOL in, tokens out at the target. Sell: tokens in, SOL out.
  const out = !target || !solUsd || !amount ? 0 : buy ? (amount * solUsd) / target : (amount * target) / solUsd;
  const making = toRaw(input, inDec);
  const taking = toRaw(plain(out, outDec), outDec);
  const sizeUsd = !solUsd || !amount ? 0 : buy ? amount * solUsd : amount * target;
  const wrongSide = !!nowPrice && !!target && (buy ? target > nowPrice : target < nowPrice);
  const insufficient = balIn !== null && amount > balIn + 1e-12;
  const can = making > 0n && taking > 0n && !insufficient && step === null && sizeUsd >= 5;

  const submit = async () => {
    if (!wallet) return openWallet();
    setError(null);
    try {
      const ttl = EXPIRIES[expiry];
      await placeLimit(
        wallet,
        { inputMint: buy ? SOL_MINT : token.mint, outputMint: buy ? token.mint : SOL_MINT, makingAmount: making.toString(), takingAmount: taking.toString(), ...(ttl ? { expiredAt: Math.floor(Date.now() / 1000) + ttl } : {}) },
        setStep,
      ).then((sig) => setDone(sig));
      toast(t.trade.placed);
      track('trade_done', { side, kind: 'limit' });
      void qc.invalidateQueries({ queryKey: qk.limitOrders(wallet.address) });
    } catch (e) {
      setError(e instanceof TradeError ? { code: e.code, detail: e.detail } : { code: 'FAILED', detail: '' });
    } finally {
      setStep(null);
    }
  };

  if (done)
    return (
      <div className="tp-done">
        <span className="ring">
          <CheckIcon />
        </span>
        <h3>{t.trade.placed}</h3>
        <p className="muted">{t.trade.placedBody}</p>
        <a className="link" href={links.tx(done)} target="_blank" rel="noopener noreferrer">
          {t.trade.viewTx} <ExternalIcon />
        </a>
        <Button block variant="glass" onClick={() => setDone(null)}>
          {t.trade.openOrders}
        </Button>
      </div>
    );

  return (
    <>
      <div className="flabel">
        <span>{buy ? t.trade.youPay : t.trade.youSell}</span>
        {balIn !== null && (
          <button type="button" onClick={() => setInput(plain(buy ? Math.max(0, balIn - 0.01) : balIn, inDec))} disabled={step !== null}>
            {t.trade.balance(`${amt(balIn)} ${buy ? 'SOL' : token.symbol}`)}
          </button>
        )}
      </div>
      <label className={cx('field big', insufficient && 'bad')}>
        <input inputMode="decimal" value={input} onChange={(e) => setInput(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.0" aria-label={buy ? t.trade.youPay : t.trade.youSell} disabled={step !== null} />
        <span className="suffix">{buy ? 'SOL' : token.symbol}</span>
      </label>

      <div className="flabel lp">
        <span>{t.trade.limitPrice(token.symbol)}</span>
        {nowPrice !== null && (
          <button type="button" onClick={() => setPrice(priceStr(nowPrice))} disabled={step !== null}>
            <Fmt>{t.trade.now(usd(nowPrice))}</Fmt>
          </button>
        )}
      </div>
      <label className={cx('field', wrongSide && 'bad')}>
        <span className="suffix">$</span>
        <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.0" aria-label={t.trade.limitPrice(token.symbol)} disabled={step !== null} />
      </label>
      {nowPrice !== null && (
        <div className="chips">
          {(buy ? BUY_STEPS : SELL_STEPS).map((p) => (
            <button key={p} type="button" className="chip" disabled={step !== null} aria-pressed={price === priceStr(nowPrice * (1 + p / 100))} onClick={() => setPrice(priceStr(nowPrice * (1 + p / 100)))}>
              {p > 0 ? '+' : ''}
              {p}%
            </button>
          ))}
        </div>
      )}

      <div className="tp-quote">
        <div className="kvrow big">
          <span>{t.trade.limitGet}</span>
          <b className="mono">{out ? <Fmt>{`${amt(out)} ${buy ? token.symbol : 'SOL'}`}</Fmt> : '—'}</b>
        </div>
        <div className="kvrow">
          <label htmlFor="lim-exp">{t.trade.expiry}</label>
          <select id="lim-exp" className="select sm" value={expiry} onChange={(e) => setExpiry(e.target.value as Expiry)} disabled={step !== null}>
            {(Object.keys(EXPIRIES) as Expiry[]).map((k) => (
              <option key={k} value={k}>
                {t.trade.expiries[k]}
              </option>
            ))}
          </select>
        </div>
        <p className="fine">{buy ? t.trade.limitBuyHint : t.trade.limitSellHint} {t.trade.limitFee}</p>
      </div>

      {wrongSide && (
        <p className="note warn">
          <WarnIcon /> {buy ? t.trade.limitAbove : t.trade.limitBelow}
        </p>
      )}
      {amount > 0 && sizeUsd < 5 && <p className="err">{t.trade.limitMin}</p>}
      {step !== null && (
        <ol className="tsteps">
          {(['build', 'sign', 'confirm'] as const).map((k, i) => (
            <li key={k} className={cx(i < step && 'done', i === step && 'on')}>
              {i < step ? <CheckIcon /> : i === step ? <span className="spin" /> : <span className="dot" />}
              {t.trade.steps[k]}
            </li>
          ))}
        </ol>
      )}
      {error && (
        <p className="err" role="alert">
          {t.trade.errors[error.code]}
          {error.detail && `: ${error.detail}`}
        </p>
      )}
      <Button block size="lg" className={buy ? undefined : 'sellbtn'} onClick={submit} disabled={wallet ? !can : false}>
        {!wallet ? t.trade.connect : step !== null ? t.trade.steps[(['build', 'sign', 'confirm'] as const)[step]!] : buy ? t.trade.placeBuy(token.symbol) : t.trade.placeSell(token.symbol)}
      </Button>
      <OpenOrders token={token} />
    </>
  );
}
