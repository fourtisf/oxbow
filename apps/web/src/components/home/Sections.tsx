'use client';

import { usd, type StockInfo } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { useStocks } from '@/lib/api/queries';
import { ChangePill, MarketChip, VerifiedChip } from '../ui/badges';
import { ArrowIcon, PlusCircleIcon, ShieldLgIcon, SwapIcon, TrendIcon } from '../ui/Icons';
import { Sparkline } from '../ui/Sparkline';
import { TokenAvatar } from '../ui/TokenAvatar';
import { ButtonLink, Fmt } from '../ui/primitives';

export function VerifiedStockCard({ s }: { s: StockInfo }) {
  const t = useT();
  return (
    <div className="vcard">
      <span className="orb" style={{ background: s.orb }} />
      <div className="top">
        <TokenAvatar asset={s} size={44} />
        <div>
          <b>{s.symbol}</b>
          <small>{s.name}</small>
        </div>
        <VerifiedChip />
      </div>
      <div className="row">
        <span className="px">
          <Fmt>{usd(s.priceUsd)}</Fmt>
        </span>
        <ChangePill value={s.change24h} />
      </div>
      <div className="spk">
        <Sparkline data={s.spark} W={240} H={40} op={0.22} sw={1.8} />
      </div>
      {s.market && <MarketChip market={s.market} />}
      {s.notice && (
        <p className="vnotice">
          <b>{t.market.notice}:</b> {s.notice}
        </p>
      )}
      <div className="meta">
        <span>{t.home.issuer(s.issuer ?? '—')}</span>
        <span>{t.common.pools(s.poolCount)}</span>
      </div>
      <ButtonLink variant="glass" href={`/create?quote=${encodeURIComponent(s.symbol)}`}>
        {t.home.pairWith(s.symbol)}
      </ButtonLink>
    </div>
  );
}

export function VerifiedStocks() {
  const t = useT();
  const { data } = useStocks();
  return (
    <div className="card block">
      <div className="hd">
        <h2>
          <span className="ic">
            <ShieldLgIcon />
          </span>
          {t.home.verifiedStocks}
        </h2>
        <span className="lnk opt-sm">{t.home.checked}</span>
      </div>
      {data && !data.length ? (
        <p className="state">{t.home.stocksEmpty}</p>
      ) : (
        <div className="vgrid">
          {(data ?? []).map((s) => (
            <VerifiedStockCard key={s.mint} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}

const HOW_ICONS = [<PlusCircleIcon key="a" />, <SwapIcon key="b" />, <TrendIcon key="c" size={18} sw={1.9} />];

export function HowItWorks() {
  const t = useT();
  return (
    <div className="how3">
      {t.home.how.map(([title, body], i) => (
        <div className="card step" key={i}>
          <div className="sh">
            <span className="ic">{HOW_ICONS[i]}</span>
            <span className="n">{t.home.step(String(i + 1).padStart(2, '0'))}</span>
          </div>
          <h3>{title}</h3>
          <p>{body}</p>
        </div>
      ))}
    </div>
  );
}

export function CtaBand() {
  const t = useT();
  const { data = [] } = useStocks();
  return (
    <div className="card ctaband">
      <div>
        <div className="stackav">
          {data.map((s) => (
            <TokenAvatar key={s.mint} asset={s} size={44} />
          ))}
        </div>
        <h2>{t.home.ctaTitle}</h2>
        <p>{t.home.ctaBody}</p>
      </div>
      <div className="cta" style={{ marginTop: 0 }}>
        <ButtonLink size="lg" href="/create">
          {t.home.createPool} <ArrowIcon />
        </ButtonLink>
        <ButtonLink variant="glass" size="lg" href="/docs">
          {t.home.readDocs}
        </ButtonLink>
      </div>
    </div>
  );
}
