'use client';

import { usd, type StockInfo } from '@oxbow/shared';
import { useStocks } from '@/lib/api/queries';
import { ArrowIcon, PlusCircleIcon, ShieldLgIcon, SwapIcon, TrendIcon } from '../ui/Icons';
import { Sparkline } from '../ui/Sparkline';
import { TokenAvatar } from '../ui/TokenAvatar';
import { ButtonLink, ChangePill, Fmt, VerifiedChip } from '../ui/primitives';

export function VerifiedStockCard({ s }: { s: StockInfo }) {
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
      <div className="meta">
        <span>Issuer: {s.issuer}</span>
        <span>
          {s.poolCount} pool{s.poolCount === 1 ? '' : 's'}
        </span>
      </div>
      <ButtonLink variant="glass" href={`/create?quote=${encodeURIComponent(s.symbol)}`}>
        Pair with {s.symbol}
      </ButtonLink>
    </div>
  );
}

export function VerifiedStocks() {
  const { data = [] } = useStocks();
  return (
    <div className="card block">
      <div className="hd">
        <h2>
          <span className="ic">
            <ShieldLgIcon />
          </span>
          Verified stocks
        </h2>
        <span className="lnk opt-sm">Price feed and liquidity checked</span>
      </div>
      <div className="vgrid">
        {data.map((s) => (
          <VerifiedStockCard key={s.mint} s={s} />
        ))}
      </div>
    </div>
  );
}

export function HowItWorks() {
  return (
    <div className="how3">
      <div className="card step">
        <div className="sh">
          <span className="ic">
            <PlusCircleIcon />
          </span>
          <span className="n">STEP 01</span>
        </div>
        <h3>Bring your token</h3>
        <p>Paste the mint of any token already live on Solana. You don&apos;t need to launch anything new.</p>
      </div>
      <div className="card step">
        <div className="sh">
          <span className="ic">
            <SwapIcon />
          </span>
          <span className="n">STEP 02</span>
        </div>
        <h3>Pick a stock</h3>
        <p>Choose Tesla, Nvidia, the S&amp;P 500 or another verified stock token, then deposit both sides in equal value.</p>
      </div>
      <div className="card step">
        <div className="sh">
          <span className="ic">
            <TrendIcon size={18} sw={1.9} />
          </span>
          <span className="n">STEP 03</span>
        </div>
        <h3>Trade and earn</h3>
        <p>Your pool goes live on Raydium, Meteora or Orca. Every swap pays a fee to whoever supplied the liquidity.</p>
      </div>
    </div>
  );
}

export function CtaBand() {
  const { data = [] } = useStocks();
  return (
    <div className="card ctaband">
      <div>
        <div className="stackav">
          {data.map((s) => (
            <TokenAvatar key={s.mint} asset={s} size={44} />
          ))}
        </div>
        <h2>Give your meme something real to trade against.</h2>
        <p>Pair it with a verified stock in about a minute. Burn or lock the liquidity so buyers can see you&apos;re in it for the long run.</p>
      </div>
      <div className="cta" style={{ marginTop: 0 }}>
        <ButtonLink size="lg" href="/create">
          Create a pool <ArrowIcon />
        </ButtonLink>
        <ButtonLink variant="glass" size="lg" href="/docs">
          Read the docs
        </ButtonLink>
      </div>
    </div>
  );
}
