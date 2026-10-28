'use client';

import type { CSSProperties, ReactNode } from 'react';
import {
  amt,
  dateIn,
  FEE_TIERS,
  feePct,
  LOCK_DAY_OPTIONS,
  num,
  quoteChips,
  tiny,
  usd,
  compactTrim,
  VENUES,
  type QuoteAsset,
} from '@oxbow/shared';
import { EXAMPLE_MINT } from '@/lib/api/mock/seed';
import { useCreateForm, type LockKind } from '@/lib/store/create';
import { useWallet } from '@/lib/store/wallet';
import { CheckIcon, CloseIcon, SearchSmIcon } from '../ui/Icons';
import { TokenAvatar } from '../ui/TokenAvatar';
import { cx, Fmt } from '../ui/primitives';
import type { CreateModel } from './model';

const cleanNum = (v: string) => v.replace(/[^0-9.,]/g, '');

function Step({ n, title, sub, done, children }: { n: number; title: string; sub: string; done: boolean; children: ReactNode }) {
  return (
    <li className={cx('card fstep', done && 'done')} id={'s' + n}>
      <div className="fstep-h">
        <span className="num" aria-hidden="true">
          {String(n).padStart(2, '0')}
        </span>
        <h3>{title}</h3>
        <span className="ok" aria-hidden={!done}>
          ✓ DONE
        </span>
      </div>
      <p className="sub">{sub}</p>
      {children}
    </li>
  );
}

function TokenStep({ m }: { m: CreateModel }) {
  const set = useCreateForm((s) => s.set);
  const t = m.token;
  const risky = t && (t.freezeAuthority || t.mintAuthority || t.risk.transferFee || t.risk.transferHook || t.risk.permanentDelegate);
  return (
    <Step n={1} title="Your token" sub="Paste the mint address of the token you want to pair." done={m.done[0]}>
      <div className="body">
        <label className={cx('field', m.lookup === 'invalid' && 'bad')}>
          <SearchSmIcon />
          <input
            id="mint"
            placeholder="Token mint address"
            aria-label="Token mint address"
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
              Use an example token
            </button>
          )}
          {m.lookup === 'invalid' && <p className="err">That isn&apos;t a Solana mint address. It should be 32 to 44 letters and numbers, with no 0, O, I or l.</p>}
          {m.lookup === 'loading' && (
            <div className="loading">
              <span className="spin" aria-hidden="true" />
              Looking up the token
            </div>
          )}
          {m.lookup === 'missing' && <p className="err">We couldn&apos;t find a token with that mint on Solana. Check the address and try again.</p>}
          {m.lookup === 'error' && <p className="err">The token lookup failed. Check your connection and try again.</p>}
          {t && (
            <>
              <div className="tcard">
                <TokenAvatar asset={t} size={44} />
                <div>
                  <b>{t.symbol}</b> <span className="meta">{t.name}</span>
                  <div className="meta">
                    Supply {t.supply.toLocaleString('en-US', { maximumFractionDigits: t.decimals })}, {t.decimals} decimals
                  </div>
                  <div className="checks">
                    {t.mintAuthority ? <span className="warn">! MINT AUTHORITY ACTIVE</span> : <span><CheckIcon />MINT AUTHORITY REVOKED</span>}
                    {t.freezeAuthority ? <span className="warn">! FREEZE AUTHORITY ON</span> : <span><CheckIcon />FREEZE AUTHORITY OFF</span>}
                    {t.risk.transferFee && <span className="warn">! TRANSFER FEE</span>}
                    {t.risk.transferHook && <span className="warn">! TRANSFER HOOK</span>}
                    {t.risk.permanentDelegate && <span className="warn">! PERMANENT DELEGATE</span>}
                  </div>
                </div>
                <button
                  className="icon-btn"
                  aria-label="Use a different token"
                  onClick={() => {
                    set({ mint: '' });
                    document.getElementById('mint')?.focus();
                  }}
                >
                  <CloseIcon />
                </button>
              </div>
              {risky && (
                <div className="note warn" role="alert">
                  <span>
                    {t.freezeAuthority && 'Someone can freeze holders of this token, so buyers might not be able to sell. '}
                    {t.mintAuthority && 'More of this token can still be minted. '}
                    {(t.risk.transferFee || t.risk.transferHook || t.risk.permanentDelegate) &&
                      'This token runs extra logic on every transfer, which some venues and wallets do not support. '}
                    Buyers will see these warnings too.
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Step>
  );
}

function QuoteTile({ q, pressed }: { q: QuoteAsset; pressed: boolean }) {
  const setQuote = useCreateForm((s) => s.setQuote);
  return (
    <button className="qtile" aria-pressed={pressed} onClick={() => setQuote(q.symbol)}>
      <TokenAvatar asset={q} size={36} />
      <span>
        <b>{q.symbol}</b>
        <small>
          {q.name}, <Fmt>{usd(q.priceUsd)}</Fmt>
        </small>
      </span>
    </button>
  );
}

function QuoteStep({ m }: { m: CreateModel }) {
  const stocks = m.quotes.filter((q) => q.kind === 'STOCK');
  const other = m.quotes.filter((q) => q.kind !== 'STOCK');
  return (
    <Step n={2} title="Pair it with" sub="Traders buy your token with this asset. Prices, fees and your earnings are all counted in it." done={m.done[1]}>
      <div className="body">
        <div className="qgroup">
          <h4 className="label">Verified stocks</h4>
          <div className="qgrid">
            {stocks.map((q) => (
              <QuoteTile key={q.symbol} q={q} pressed={m.form.quote === q.symbol} />
            ))}
          </div>
        </div>
        <div className="qgroup">
          <h4 className="label">Crypto and dollars</h4>
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
  const set = useCreateForm((s) => s.set);
  const wallet = useWallet((s) => s.wallet);
  const { token: t, quote: q } = m;
  const sym = t?.symbol ?? 'TOKEN';
  return (
    <Step n={3} title="Deposit" sub="How much of each goes in. The ratio sets your token's starting price." done={m.done[2]}>
      <div className="body">
        <div className="two">
          <div>
            <div className="flabel">
              <b>{t ? t.symbol : 'Your token'}</b>
              <span>{t && wallet ? `You hold ${compactTrim(m.baseBal)}` : ''}</span>
            </div>
            <label className={cx('field big', m.baseOver && 'bad')}>
              <input inputMode="decimal" placeholder="0" aria-label="Amount of your token" value={m.form.base} onChange={(e) => set({ base: cleanNum(e.target.value) })} />
              <span className="suffix">{sym}</span>
            </label>
            <div className="chips">
              {t &&
                [25, 50, 80, 100].map((p) => {
                  const v = (t.supply * p) / 100;
                  return (
                    <button key={p} className="chip" aria-pressed={num(m.form.base) === v} onClick={() => set({ base: v.toLocaleString('en-US') })}>
                      {p}% SUPPLY
                    </button>
                  );
                })}
            </div>
          </div>
          <div>
            <div className="flabel">
              <b>{q ? q.symbol : 'Pair asset'}</b>
              <span>
                {q &&
                  (wallet ? (
                    <>
                      Balance {amt(m.quoteBal)}{' '}
                      <button type="button" onClick={() => set({ qamt: String(m.quoteBal) })}>
                        MAX
                      </button>
                    </>
                  ) : (
                    'Select a wallet to see your balance'
                  ))}
              </span>
            </div>
            <label className={cx('field big', m.quoteOver && 'bad')}>
              <input inputMode="decimal" placeholder="0" aria-label="Amount of pair asset" value={m.form.qamt} onChange={(e) => set({ qamt: cleanNum(e.target.value) })} />
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
          </div>
        </div>
        <dl className="derived">
          <div>
            <dt>Starting price</dt>
            <dd>
              {m.priceQ ? <Fmt>{usd(m.priceU)}</Fmt> : '—'}
              <small>
                {m.priceQ && q ? (
                  <>
                    <Fmt>{tiny(m.priceQ)}</Fmt> {q.symbol}
                  </>
                ) : (
                  'per ' + sym
                )}
              </small>
            </dd>
          </div>
          <div>
            <dt>Starting mkt cap</dt>
            <dd>
              {m.priceQ ? <Fmt>{usd(m.mcap)}</Fmt> : '—'}
              <small>at {t ? compactTrim(t.supply) : '1B'} supply</small>
            </dd>
          </div>
          <div>
            <dt>Liquidity</dt>
            <dd>
              {m.liq ? <Fmt>{usd(m.liq)}</Fmt> : '—'}
              <small>both sides together</small>
            </dd>
          </div>
        </dl>
      </div>
    </Step>
  );
}

function VenueStep({ m }: { m: CreateModel }) {
  const set = useCreateForm((s) => s.set);
  return (
    <Step n={4} title="Venue and fee" sub="Where the pool lives, and what traders pay on each swap. Higher fees earn more per trade but can slow trading down." done={m.done[3]}>
      <div className="body">
        <div className="venues">
          {VENUES.map((v) => (
            <button key={v.id} className="vtile" aria-pressed={m.form.venue === v.id} onClick={() => set({ venue: v.id })}>
              <b>{v.label}</b>
              <small>{v.desc}</small>
            </button>
          ))}
        </div>
        <div className="label fee-h" id="feeLbl">
          Trading fee
        </div>
        <div className="feegrid" role="group" aria-labelledby="feeLbl">
          {FEE_TIERS.map((f) => (
            <button key={f.feeBps} className="ftile" aria-pressed={m.form.feeBps === f.feeBps} onClick={() => set({ feeBps: f.feeBps })}>
              <b>{feePct(f.feeBps)}</b>
              <small>
                {f.desc}. Earns ${f.feeBps.toLocaleString('en-US')} per $10K traded
              </small>
            </button>
          ))}
        </div>
      </div>
    </Step>
  );
}

const LOCKS: { id: LockKind; title: string; desc: string; risky?: boolean }[] = [
  { id: 'burn', title: 'Burn it', desc: 'Permanent. Nobody, including you, can withdraw the deposit. You still collect trading fees. Buyers trust this most.' },
  { id: 'lock', title: 'Lock it for a set time', desc: 'You get the deposit back when the lock ends, and collect trading fees meanwhile.' },
  { id: 'none', title: 'Keep it unlocked', desc: 'You can withdraw any time. Your pool is labeled Unlocked in Explore, so buyers know.', risky: true },
];

function LockStep({ m }: { m: CreateModel }) {
  const set = useCreateForm((s) => s.set);
  const f = m.form;
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
    <Step n={5} title="Liquidity lock" sub="Decide whether you can withdraw your deposit later. Buyers see this label on your pool." done={m.done[4]}>
      <div className="body opts" role="radiogroup" aria-label="Liquidity lock">
        {opt(LOCKS[0]!)}
        {opt(LOCKS[1]!)}
        {f.lock === 'lock' && (
          <div className="lockset">
            <div className="chips" role="group" aria-label="Lock length">
              {LOCK_DAY_OPTIONS.map((d) => (
                <button key={d} className="chip" aria-pressed={f.days === d} onClick={() => set({ days: d })}>
                  {d === 365 ? '1 YEAR' : d + ' DAYS'}
                </button>
              ))}
            </div>
            <div className="row">
              <span>Share of the deposit to lock</span>
              <b>{f.lpct}%</b>
            </div>
            <input
              className="range"
              type="range"
              min={10}
              max={100}
              step={5}
              value={f.lpct}
              aria-label="Share of the deposit to lock"
              style={{ '--p': ((f.lpct - 10) / 90) * 100 + '%', marginTop: 12 } as CSSProperties}
              onChange={(e) => set({ lpct: +e.target.value })}
            />
            <div className="row">
              <span>Unlocks on</span>
              <b>{dateIn(f.days)}</b>
            </div>
          </div>
        )}
        {opt(LOCKS[2]!)}
      </div>
    </Step>
  );
}

export function CreateSteps({ m }: { m: CreateModel }) {
  return (
    <>
      {/* Visually hidden (and out of the grid flow): keeps h1 > h2 > h3 heading order for the step titles. */}
      <h2 id="flowTitle" className="sr-only">
        Pool setup
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
