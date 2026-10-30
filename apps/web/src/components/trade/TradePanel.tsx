'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { amt, BUY_CHIPS_SOL, SELL_CHIPS_PCT, SLIPPAGE_BPS, SOL_MINT, shortAddr, type TradeSide } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { track } from '@/lib/analytics';
import { qk } from '@/lib/api/keys';
import { useDebounced } from '@/lib/hooks';
import { links } from '@/lib/links';
import { toast } from '@/lib/store/toast';
import { useTrade } from '@/lib/store/trade';
import { useWallet } from '@/lib/store/wallet';
import { executeSwap, fromRaw, getBalances, getQuote, TradeError, toRaw, type TradeErrorCode } from '@/lib/trade';
import { CheckIcon, CloseIcon, ExternalIcon, WarnIcon } from '../ui/Icons';
import { Modal } from '../ui/overlay';
import { Button, cx, Fmt } from '../ui/primitives';
import { TokenAvatar } from '../ui/TokenAvatar';
import { LimitForm } from './LimitForm';

const SOL_DECIMALS = 9;
/** SOL kept back on MAX for network and account fees. */
const SOL_RESERVE = 0.01;
const HIGH_IMPACT_PCT = 5;

/** "1.2345" without exponent or grouping, the way the amount box shows it. */
const plain = (n: number, d: number) => (n > 0 ? n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: Math.min(d, 9) }) : '');

/** The buy/sell panel, opened from the feed, a wallet's holdings or a token page. */
export function TradePanel() {
  const target = useTrade((s) => s.target);
  const close = useTrade((s) => s.close);
  const [busy, setBusy] = useState(false);
  const t = useT();
  return (
    <Modal open={!!target} onClose={close} label={target ? (target.side === 'BUY' ? t.trade.buyTitle(target.token.symbol) : t.trade.sellTitle(target.token.symbol)) : ''} busy={busy}>
      {target && <Panel key={`${target.token.mint}:${target.side}`} onBusy={setBusy} />}
    </Modal>
  );
}

function Panel({ onBusy }: { onBusy: (b: boolean) => void }) {
  const t = useT();
  const qc = useQueryClient();
  const { target, close, slippageBps, setSlippage } = useTrade();
  const wallet = useWallet((s) => s.wallet);
  const openWallet = useWallet((s) => s.open);
  const [side, setSide] = useState<TradeSide>(target!.side);
  const [mode, setMode] = useState<'market' | 'limit'>('market');
  const [limitBusy, setLimitBusy] = useState(false);
  const [input, setInput] = useState('');
  const [step, setStep] = useState<number | null>(null);
  const [error, setError] = useState<TradeErrorCode | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const token = target!.token;
  const buy = side === 'BUY';
  const inMint = buy ? SOL_MINT : token.mint;
  const outMint = buy ? token.mint : SOL_MINT;
  const inDec = buy ? SOL_DECIMALS : token.decimals;
  const outDec = buy ? token.decimals : SOL_DECIMALS;
  const inSym = buy ? 'SOL' : token.symbol;
  const outSym = buy ? token.symbol : 'SOL';

  const mints = [SOL_MINT, token.mint];
  const balances = useQuery({
    queryKey: qk.balances(wallet?.address ?? '', mints),
    queryFn: () => getBalances(wallet!.address, mints),
    enabled: !!wallet,
    staleTime: 15_000,
  });
  const balIn = balances.data?.[inMint] ?? null;

  const raw = toRaw(input, inDec);
  const amount = useDebounced(raw.toString(), 350);
  const quote = useQuery({
    queryKey: ['quote', inMint, outMint, amount, slippageBps],
    queryFn: () => getQuote({ inputMint: inMint, outputMint: outMint, amount: BigInt(amount), slippageBps }),
    enabled: mode === 'market' && BigInt(amount) > 0n && step === null && !done,
    refetchInterval: 15_000,
    retry: false,
  });
  const q = quote.data && quote.data.inputMint === inMint && BigInt(amount) === raw ? quote.data : null;
  const noRoute = (quote.error as { code?: string } | null)?.code === 'no_route';

  useEffect(() => onBusy(step !== null || limitBusy), [step, limitBusy, onBusy]);
  useEffect(() => {
    setInput('');
    setError(null);
  }, [side]);

  const insufficient = balIn !== null && Number(input || 0) > balIn + 1e-12;
  const highImpact = !!q && q.priceImpactPct > HIGH_IMPACT_PCT;
  const needsAck = !!target!.danger && buy;
  const canSubmit = !!q && !insufficient && step === null && (!needsAck || ack);

  const submit = async () => {
    if (!wallet) {
      openWallet();
      return;
    }
    if (!q) return;
    setError(null);
    try {
      const r = await executeSwap(wallet, { inputMint: inMint, outputMint: outMint, amount: raw, slippageBps }, (s) => setStep(s));
      setDone(r.signature);
      toast(t.trade.done(side, token.symbol));
      track('trade_done', { side });
      void qc.invalidateQueries({ queryKey: ['balances'] });
    } catch (e) {
      setError(e instanceof TradeError ? e.code : 'FAILED');
    } finally {
      setStep(null);
    }
  };

  const chips = buy
    ? BUY_CHIPS_SOL.map((v) => ({ label: `${v} SOL`, value: String(v), on: input === String(v) }))
    : SELL_CHIPS_PCT.map((p) => ({ label: p === 100 ? t.trade.max : `${p}%`, value: balIn ? plain((balIn * p) / 100, token.decimals) : '', on: !!balIn && input === plain((balIn * p) / 100, token.decimals) }));

  return (
    <div className="tpanel">
      <div className="m-h">
        <div className="tp-title">
          <TokenAvatar asset={token} size={34} />
          <div>
            <h2>{buy ? t.trade.buyTitle(token.symbol) : t.trade.sellTitle(token.symbol)}</h2>
            {target!.from && <p className="m-sub">{t.trade.copying(target!.from.name ?? shortAddr(target!.from.address))}</p>}
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={close} aria-label={t.common.close} disabled={step !== null || limitBusy}>
          <CloseIcon />
        </button>
      </div>

      {done ? (
        <div className="tp-done">
          <span className="ring">
            <CheckIcon />
          </span>
          <h3>{t.trade.done(side, token.symbol)}</h3>
          <a className="link" href={links.tx(done)} target="_blank" rel="noopener noreferrer">
            {t.trade.viewTx} <ExternalIcon />
          </a>
          <Button block onClick={close}>
            {t.common.close}
          </Button>
        </div>
      ) : (
        <>
          <div className="seg tp-side" role="group" aria-label={t.trade.side}>
            <button type="button" aria-pressed={buy} onClick={() => setSide('BUY')} disabled={step !== null || limitBusy}>
              {t.trade.buy}
            </button>
            <button type="button" aria-pressed={!buy} onClick={() => setSide('SELL')} disabled={step !== null || limitBusy}>
              {t.trade.sell}
            </button>
          </div>

          <div className="seg tp-mode" role="group" aria-label={t.trade.mode}>
            <button type="button" aria-pressed={mode === 'market'} onClick={() => setMode('market')} disabled={step !== null || limitBusy}>
              {t.trade.market}
            </button>
            <button type="button" aria-pressed={mode === 'limit'} onClick={() => setMode('limit')} disabled={step !== null || limitBusy}>
              {t.trade.limit}
            </button>
          </div>
          {mode === 'limit' ? (
            <LimitForm key={side} token={token} side={side} onBusy={setLimitBusy} />
          ) : (
            <>
          <div className="flabel">
            <span>{buy ? t.trade.youPay : t.trade.youSell}</span>
            {balIn !== null && (
              <button
                type="button"
                onClick={() => setInput(plain(buy ? Math.max(0, balIn - SOL_RESERVE) : balIn, inDec))}
                disabled={step !== null}
              >
                {t.trade.balance(`${amt(balIn)} ${inSym}`)}
              </button>
            )}
          </div>
          <label className={cx('field big', insufficient && 'bad')}>
            <input
              inputMode="decimal"
              value={input}
              onChange={(e) => setInput(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="0.0"
              aria-label={buy ? t.trade.youPay : t.trade.youSell}
              disabled={step !== null}
            />
            <span className="suffix">{inSym}</span>
          </label>
          <div className="chips">
            {chips.map((c) => (
              <button key={c.label} type="button" className="chip" aria-pressed={c.on} disabled={!c.value || step !== null} onClick={() => setInput(c.value)}>
                {c.label}
              </button>
            ))}
          </div>

          <div className="tp-quote" aria-live="polite">
            <div className="kvrow big">
              <span>{t.trade.youGet}</span>
              <b className="mono">
                {quote.isFetching && !q ? <span className="spin" /> : q ? <Fmt>{`${amt(fromRaw(q.outAmount, outDec))} ${outSym}`}</Fmt> : '—'}
              </b>
            </div>
            {q && (
              <>
                <div className="kvrow">
                  <span>{t.trade.minReceived}</span>
                  <span className="mono">
                    <Fmt>{`${amt(fromRaw(q.minOutAmount, outDec))} ${outSym}`}</Fmt>
                  </span>
                </div>
                <div className="kvrow">
                  <span>{t.trade.impact}</span>
                  <span className={cx('mono', highImpact && 'down')}>{q.priceImpactPct < 0.01 ? '<0.01%' : `${q.priceImpactPct.toFixed(2)}%`}</span>
                </div>
                <div className="kvrow">
                  <span>{q.feeBps ? t.trade.fee(`${q.feeBps / 100}%`) : t.trade.noFee}</span>
                  <span className="mono">{q.feeBps ? <Fmt>{`${amt(fromRaw(q.feeLamports, SOL_DECIMALS))} SOL`}</Fmt> : t.trade.free}</span>
                </div>
                {q.route.length > 0 && (
                  <div className="kvrow">
                    <span>{t.trade.route}</span>
                    <span className="mono">{q.route.join(' → ')}</span>
                  </div>
                )}
              </>
            )}
            <div className="kvrow">
              <span>{t.trade.slippage}</span>
              <span className="chips tight">
                {SLIPPAGE_BPS.map((b) => (
                  <button key={b} type="button" className="chip" aria-pressed={slippageBps === b} onClick={() => setSlippage(b)} disabled={step !== null}>
                    {b / 100}%
                  </button>
                ))}
              </span>
            </div>
          </div>

          {highImpact && (
            <p className="note warn">
              <WarnIcon /> {t.trade.highImpact}
            </p>
          )}
          {noRoute && <p className="err">{t.trade.noRoute}</p>}
          {quote.isError && !noRoute && <p className="err">{t.trade.quoteFailed}</p>}
          {needsAck && (
            <label className="check">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>{t.trade.dangerAck}</span>
            </label>
          )}

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
              {t.trade.errors[error]}
            </p>
          )}

          <Button block size="lg" className={buy ? undefined : 'sellbtn'} onClick={submit} disabled={wallet ? !canSubmit : false}>
            {!wallet
              ? t.trade.connect
              : step !== null
                ? t.trade.steps[(['build', 'sign', 'confirm'] as const)[step]!]
                : !raw
                  ? t.trade.enterAmount
                  : insufficient
                    ? t.trade.insufficient
                    : buy
                      ? t.trade.confirmBuy(token.symbol)
                      : t.trade.confirmSell(token.symbol)}
          </Button>
            </>
          )}
          <p className="fine">{t.trade.disclaimer}</p>
        </>
      )}
    </div>
  );
}
