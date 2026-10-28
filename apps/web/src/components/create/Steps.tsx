'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { amt, compactTrim, FEE_TIERS, feePct, LOCK_DAY_OPTIONS, num, quoteChips, tiny, usd, VENUES, type QuoteAsset } from '@oxbow/shared';
import { useLocale, useT } from '@/i18n/client';
import { dateInL } from '@/i18n/format';
import { EXAMPLE_MINT } from '@/lib/api/mock/seed';
import { links } from '@/lib/links';
import { ExtLink } from '../ui/ExtLink';
import { useCreateForm, type LockKind } from '@/lib/store/create';
import { useWallet } from '@/lib/store/wallet';
import { CheckIcon, CloseIcon, SearchSmIcon, WarnIcon } from '../ui/Icons';
import { TokenAvatar } from '../ui/TokenAvatar';
import { cx, Fmt } from '../ui/primitives';
import type { CreateModel } from './model';

const cleanNum = (v: string) => v.replace(/[^0-9.,]/g, '');

function Step({ n, title, sub, done, children }: { n: number; title: string; sub: ReactNode; done: boolean; children: ReactNode }) {
  const t = useT();
  return (
    <li className={cx('card fstep', done && 'done')} id={'s' + n}>
      <div className="fstep-h">
        <span className="num" aria-hidden="true">
          {String(n).padStart(2, '0')}
        </span>
        <h3>{title}</h3>
        <span className="ok" aria-hidden={!done}>
          {t.create.done}
        </span>
      </div>
      <p className="sub">{sub}</p>
      {children}
    </li>
  );
}

function TokenStep({ m }: { m: CreateModel }) {
  const t = useT();
  const set = useCreateForm((s) => s.set);
  const ack = useCreateForm((s) => s.ack);
  const tk = m.token;
  return (
    <Step n={1} title={t.create.s1} sub={t.create.s1sub} done={m.done[0]}>
      <div className="body">
        <label className={cx('field', m.lookup === 'invalid' && 'bad')}>
          <SearchSmIcon />
          <input
            id="mint"
            placeholder={t.create.mintAria}
            aria-label={t.create.mintAria}
            aria-invalid={m.lookup === 'invalid' || undefined}
            aria-describedby="tokenOut"
            autoComplete="off"
            spellCheck={false}
            value={m.form.mint}
            onChange={(e) => set({ mint: e.target.value })}
          />
        </label>
        <div id="tokenOut" aria-live="polite">
          {m.lookup === 'empty' && (
            <button className="link" onClick={() => set({ mint: EXAMPLE_MINT })}>
              {t.create.example}
            </button>
          )}
          {m.lookup === 'invalid' && <p className="err">{t.create.invalid}</p>}
          {m.lookup === 'loading' && (
            <div className="loading">
              <span className="spin" aria-hidden="true" />
              {t.create.lookingUp}
            </div>
          )}
          {m.lookup === 'missing' && <p className="err">{t.create.missing}</p>}
          {m.lookup === 'error' && <p className="err">{t.create.lookupError}</p>}
          {tk && (
            <>
              <div className="tcard">
                <TokenAvatar asset={tk} size={44} />
                <div>
                  <b>{tk.symbol}</b> <span className="meta">{tk.name}</span>
                  <div className="meta">{t.create.supply(tk.supply.toLocaleString('en-US', { maximumFractionDigits: tk.decimals }), tk.decimals)}</div>
                  <div className="checks">
                    {tk.mintAuthority ? (
                      <span className="warn">! {t.create.check.mintActive}</span>
                    ) : (
                      <span>
                        <CheckIcon />
                        {t.create.check.mintRevoked}
                      </span>
                    )}
                    {tk.freezeAuthority ? (
                      <span className="warn">! {t.create.check.freezeOn}</span>
                    ) : (
                      <span>
                        <CheckIcon />
                        {t.create.check.freezeOff}
                      </span>
                    )}
                    {tk.risk.transferFee && <span className="warn">! {t.create.check.fee}</span>}
                    {tk.risk.transferHook && <span className="warn">! {t.create.check.hook}</span>}
                    {tk.risk.permanentDelegate && <span className="warn">! {t.create.check.delegate}</span>}
                  </div>
                </div>
                <button
                  className="icon-btn"
                  aria-label={t.create.clear}
                  onClick={() => {
                    set({ mint: '' });
                    document.getElementById('mint')?.focus();
                  }}
                >
                  <CloseIcon />
                </button>
              </div>
              {!tk.logoUri && <p className="fine">{t.create.risk.noLogo}</p>}
              {tk.symbolTaken && (
                <div className="note mid">
                  <WarnIcon />
                  <span>{t.create.risk.dupe(tk.symbol)}</span>
                </div>
              )}
              {m.risky && (
                <div className="note warn" role="alert">
                  <WarnIcon />
                  <span>
                    {tk.freezeAuthority && t.create.risk.freeze + ' '}
                    {tk.mintAuthority && t.create.risk.mint + ' '}
                    {(tk.risk.transferFee || tk.risk.transferHook || tk.risk.permanentDelegate) && t.create.risk.ext + ' '}
                    {t.create.risk.tail}
                  </span>
                </div>
              )}
              {m.risky && (
                <label className="check ack">
                  <input type="checkbox" id="riskAck" checked={ack} onChange={(e) => set({ ack: e.target.checked })} />
                  <span>{t.create.risk.ack}</span>
                </label>
              )}
            </>
          )}
        </div>
      </div>
    </Step>
  );
}

function QuoteTile({ q, pressed }: { q: QuoteAsset; pressed: boolean }) {
  const t = useT();
  const setQuote = useCreateForm((s) => s.setQuote);
  return (
    <button className="qtile" aria-pressed={pressed} onClick={() => setQuote(q.symbol)}>
      <TokenAvatar asset={q} size={36} />
      <span>
        <b>{q.symbol}</b>
        <small>
          {q.name}, <Fmt>{usd(q.priceUsd)}</Fmt>
          {q.market?.status === 'CLOSED' && <span className="sr-only">, {t.market.closed}</span>}
        </small>
      </span>
    </button>
  );
}

function QuoteStep({ m }: { m: CreateModel }) {
  const t = useT();
  const stocks = m.quotes.filter((q) => q.kind === 'STOCK');
  const other = m.quotes.filter((q) => q.kind !== 'STOCK');
  return (
    <Step n={2} title={t.create.s2} sub={t.create.s2sub} done={m.done[1]}>
      <div className="body">
        <div className="qgroup">
          <h4 className="label">{t.create.stocksGroup}</h4>
          <div className="qgrid">
            {stocks.map((q) => (
              <QuoteTile key={q.symbol} q={q} pressed={m.form.quote === q.symbol} />
            ))}
          </div>
        </div>
        <div className="qgroup">
          <h4 className="label">{t.create.cryptoGroup}</h4>
          <div className="qgrid">
            {other.map((q) => (
              <QuoteTile key={q.symbol} q={q} pressed={m.form.quote === q.symbol} />
            ))}
          </div>
        </div>
      </div>
    </Step>
  );
}

function DepositStep({ m }: { m: CreateModel }) {
  const t = useT();
  const set = useCreateForm((s) => s.set);
  const wallet = useWallet((s) => s.wallet);
  const { token: tk, quote: q } = m;
  const sym = tk?.symbol ?? 'TOKEN';
  return (
    <Step
      n={3}
      title={t.create.s3}
      sub={
        <>
          {t.create.s3sub}{' '}
          <Link href="/docs#d-risks" className="link" style={{ marginTop: 0 }}>
            {t.trade.ilLink}
          </Link>
        </>
      }
      done={m.done[2]}
    >
      <div className="body">
        <div className="two">
          <div>
            <div className="flabel">
              <b>{tk ? tk.symbol : t.create.yourToken}</b>
              <span>{tk && wallet ? t.create.youHold(compactTrim(m.baseBal)) : ''}</span>
            </div>
            <label className={cx('field big', m.baseOver && 'bad')}>
              <input inputMode="decimal" placeholder="0" aria-label={t.create.baseAria} value={m.form.base} onChange={(e) => set({ base: cleanNum(e.target.value) })} />
              <span className="suffix">{sym}</span>
            </label>
            <div className="chips">
              {tk &&
                [25, 50, 80, 100].map((p) => {
                  const v = (tk.supply * p) / 100;
                  return (
                    <button key={p} className="chip" aria-pressed={num(m.form.base) === v} onClick={() => set({ base: v.toLocaleString('en-US') })}>
                      {t.create.pctSupply(p)}
                    </button>
                  );
                })}
            </div>
          </div>
          <div>
            <div className="flabel">
              <b>{q ? q.symbol : t.create.pairAsset}</b>
              <span>
                {q &&
                  (wallet ? (
                    <>
                      {t.create.balance(amt(m.quoteBal))}{' '}
                      <button type="button" onClick={() => set({ qamt: String(m.quoteBal) })}>
                        {t.trade.max}
                      </button>
                    </>
                  ) : (
                    t.create.selectForBalance
                  ))}
              </span>
            </div>
            <label className={cx('field big', m.quoteOver && 'bad')}>
              <input inputMode="decimal" placeholder="0" aria-label={t.create.quoteAria} value={m.form.qamt} onChange={(e) => set({ qamt: cleanNum(e.target.value) })} />
              <span className="suffix">{q ? q.symbol : '—'}</span>
            </label>
            <div className="chips">
              {q &&
                quoteChips(q.symbol, q.kind).map((v) => (
                  <button key={v} className="chip" aria-pressed={num(m.form.qamt) === v} onClick={() => set({ qamt: String(v) })}>
                    {v.toLocaleString('en-US')} {q.symbol}
                  </button>
                ))}
            </div>
            {q && wallet && (m.quoteBal === 0 || m.quoteOver) && (
              <ExtLink className="getlink" href={links.buy(q.mint)}>
                {t.create.getOn(q.symbol)}
              </ExtLink>
            )}
          </div>
        </div>
        <dl className="derived">
          <div>
            <dt>{t.create.startPrice}</dt>
            <dd>
              {m.priceQ ? <Fmt>{usd(m.priceU)}</Fmt> : '—'}
              <small>
                {m.priceQ && q ? (
                  <>
                    <Fmt>{tiny(m.priceQ)}</Fmt> {q.symbol}
                  </>
                ) : (
                  t.create.per(sym)
                )}
              </small>
            </dd>
          </div>
          <div>
            <dt>{t.create.startMcap}</dt>
            <dd>
              {m.priceQ ? <Fmt>{usd(m.mcap)}</Fmt> : '—'}
              <small>{t.create.atSupply(tk ? compactTrim(tk.supply) : '1B')}</small>
            </dd>
          </div>
          <div>
            <dt>{t.create.liquidity}</dt>
            <dd>
              {m.liq ? <Fmt>{usd(m.liq)}</Fmt> : '—'}
              <small>{t.create.bothSides}</small>
            </dd>
          </div>
        </dl>
      </div>
    </Step>
  );
}

function VenueStep({ m }: { m: CreateModel }) {
  const t = useT();
  const set = useCreateForm((s) => s.set);
  return (
    <Step n={4} title={t.create.s4} sub={t.create.s4sub} done={m.done[3]}>
      <div className="body">
        <div className="venues">
          {VENUES.map((v) => (
            <button key={v.id} className="vtile" aria-pressed={m.form.venue === v.id} onClick={() => set({ venue: v.id })}>
              <b>{v.label}</b>
              <small>{t.create.venueDesc[v.id]}</small>
            </button>
          ))}
        </div>
        <div className="label fee-h" id="feeLbl">
          {t.create.tradingFee}
        </div>
        <div className="feegrid" role="group" aria-labelledby="feeLbl">
          {FEE_TIERS.map((f) => (
            <button key={f.feeBps} className="ftile" aria-pressed={m.form.feeBps === f.feeBps} onClick={() => set({ feeBps: f.feeBps })}>
              <b>{feePct(f.feeBps)}</b>
              <small>
                {t.create.feeDesc[f.feeBps] ?? f.desc}. {t.create.earns('$' + f.feeBps.toLocaleString('en-US'))}
              </small>
            </button>
          ))}
        </div>
      </div>
    </Step>
  );
}

function LockStep({ m }: { m: CreateModel }) {
  const t = useT();
  const locale = useLocale();
  const set = useCreateForm((s) => s.set);
  const f = m.form;
  const LOCKS: { id: LockKind; title: string; desc: string; risky?: boolean }[] = [
    { id: 'burn', title: t.create.burn, desc: t.create.burnDesc },
    { id: 'lock', title: t.create.lock, desc: t.create.lockDesc },
    { id: 'none', title: t.create.none, desc: t.create.noneDesc, risky: true },
  ];
  const move = (dir: 1 | -1) => {
    const i = LOCKS.findIndex((l) => l.id === f.lock);
    const next = LOCKS[(i + dir + LOCKS.length) % LOCKS.length]!;
    set({ lock: next.id });
    document.querySelector<HTMLElement>(`[data-lock="${next.id}"]`)?.focus();
  };
  const opt = (l: (typeof LOCKS)[number]) => (
    <button
      key={l.id}
      className={cx('opt', l.risky && 'risky')}
      role="radio"
      data-lock={l.id}
      aria-checked={f.lock === l.id}
      tabIndex={f.lock === l.id ? 0 : -1}
      onClick={() => set({ lock: l.id })}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          move(1);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      <span className="radio" aria-hidden="true" />
      <span>
        <b>{l.title}</b>
        <small>{l.desc}</small>
      </span>
    </button>
  );
  return (
    <Step n={5} title={t.create.s5} sub={t.create.s5sub} done={m.done[4]}>
      <div className="body opts" role="radiogroup" aria-label={t.create.lockAria}>
        {opt(LOCKS[0]!)}
        {opt(LOCKS[1]!)}
        {f.lock === 'lock' && (
          <div className="lockset">
            <div className="chips" role="group" aria-label={t.create.lockLength}>
              {LOCK_DAY_OPTIONS.map((d) => (
                <button key={d} className="chip" aria-pressed={f.days === d} onClick={() => set({ days: d })}>
                  {t.create.days(d)}
                </button>
              ))}
            </div>
            <div className="row">
              <span>{t.create.lockShare}</span>
              <b>{f.lpct}%</b>
            </div>
            <input
              className="range"
              type="range"
              min={10}
              max={100}
              step={5}
              value={f.lpct}
              aria-label={t.create.lockShare}
              style={{ '--p': ((f.lpct - 10) / 90) * 100 + '%', marginTop: 12 } as CSSProperties}
              onChange={(e) => set({ lpct: +e.target.value })}
            />
            <div className="row">
              <span>{t.create.unlocksOn}</span>
              <b>{dateInL(f.days, locale)}</b>
            </div>
          </div>
        )}
        {opt(LOCKS[2]!)}
      </div>
    </Step>
  );
}

export function CreateSteps({ m }: { m: CreateModel }) {
  const t = useT();
  return (
    <>
      {/* Visually hidden (and out of the grid flow): keeps h1 > h2 > h3 heading order for the step titles. */}
      <h2 id="flowTitle" className="sr-only">
        {t.create.setup}
      </h2>
      <ol className="flow" aria-labelledby="flowTitle">
        <TokenStep m={m} />
        <QuoteStep m={m} />
        <DepositStep m={m} />
        <VenueStep m={m} />
        <LockStep m={m} />
      </ol>
    </>
  );
}
