'use client';

import Link from 'next/link';
import { usd } from '@oxbow/shared';
import { env } from '@/lib/env';
import { copyText } from '@/lib/copy';
import { useStats, useStocks } from '@/lib/api/queries';
import { poolHref } from '@/lib/nav';
import { prefersReducedMotion } from '@/lib/hooks';
import { ArrowIcon, CopyIcon } from '../ui/Icons';
import { Sparkline } from '../ui/Sparkline';
import { PairAvatar, TokenAvatar } from '../ui/TokenAvatar';
import { Button, ButtonLink, ChangePill, Fmt } from '../ui/primitives';
import { PixelCity } from './PixelCity';

/** Floating chips over the city: a featured verified stock and the top mover. */
function FloatChips() {
  const { data: stocks } = useStocks();
  const { data: stats } = useStats();
  const stock = stocks?.find((s) => s.symbol === 'TSLAx') ?? stocks?.[0];
  const top = stats?.topGainer;
  return (
    <>
      <div className="fchip f1">
        {stock && (
          <>
            <TokenAvatar asset={stock} size={38} />
            <div>
              <b>{stock.symbol}</b>
              <small>{stock.name}, verified</small>
            </div>
            <div className="r">
              <b>
                <Fmt>{usd(stock.priceUsd)}</Fmt>
              </b>
              <ChangePill value={stock.change24h} />
            </div>
          </>
        )}
      </div>
      {top ? (
        <Link className="fchip f2" href={poolHref(top.pool.address)} scroll={false}>
          <PairAvatar base={top.pool.base} quote={top.pool.quote} size={34} />
          <div>
            <b>
              {top.pool.base.symbol}/{top.pool.quote.symbol}
            </b>
            <small>Top mover, 24h</small>
          </div>
          <div className="r">
            <Sparkline data={top.spark1d} W={86} H={30} op={0.3} sw={1.8} w={86} h={30} />
            <ChangePill value={top.pool.change24h} />
          </div>
        </Link>
      ) : (
        <div className="fchip f2" />
      )}
    </>
  );
}

export function Hero() {
  return (
    <div className="card hero">
      <div className="hero-aura" />
      <div className="hero-floor" />
      <PixelCity />
      <FloatChips />
      <div className="hero-copy">
        <div className="eyebrow">
          <span className="live" aria-hidden="true" />
          Memecoins <b>×</b> Tokenized stocks
        </div>
        <h1>
          <b className="l1" style={{ fontWeight: 'inherit', display: 'block' }}>
            Pick a meme.
          </b>
          <span>Pair a stock.</span>
        </h1>
        <p className="lede">
          Create a stock-paired pool for any token already on Solana. Pair your memecoin with Tesla, Nvidia, the S&amp;P 500 or any verified stock token.
        </p>
        <div className="cta">
          <ButtonLink size="lg" href="/create">
            Create a pool <ArrowIcon />
          </ButtonLink>
          <Button
            variant="glass"
            size="lg"
            onClick={() =>
              document.getElementById('movers')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' })
            }
          >
            Explore movers
          </Button>
        </div>
        {env.contractAddress && (
          <div className="ca">
            <span className="tag">CA</span>
            <span className="addr-t">{env.contractAddress}</span>
            <button className="icon-btn" onClick={() => copyText(env.contractAddress!)} aria-label="Copy contract address">
              <CopyIcon />
            </button>
          </div>
        )}
        <div className="venues-row">
          Routes through <span className="v">Raydium</span>
          <span className="v">Meteora</span>
          <span className="v">Orca</span>
          <span className="v">Jupiter</span>
        </div>
      </div>
    </div>
  );
}
