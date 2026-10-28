'use client';

import Link from 'next/link';
import { usd } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { env } from '@/lib/env';
import { copyText } from '@/lib/copy';
import { useStats, useStocks } from '@/lib/api/queries';
import { poolHref } from '@/lib/nav';
import { prefersReducedMotion } from '@/lib/hooks';
import { ChangePill } from '../ui/badges';
import { ArrowIcon, CopyIcon } from '../ui/Icons';
import { Sparkline } from '../ui/Sparkline';
import { PairAvatar, TokenAvatar } from '../ui/TokenAvatar';
import { Button, ButtonLink, Fmt } from '../ui/primitives';
import { PixelCity } from './PixelCity';

/** Floating chips over the city: a featured verified stock and the top mover. */
function FloatChips() {
  const t = useT();
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
              <small>{t.home.verifiedChip(stock.name)}</small>
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
            <small>{t.home.topMover}</small>
          </div>
          <div className="r">
            <Sparkline data={top.spark1d} W={86} H={30} op={0.3} sw={1.8} w={86} h={30} />
            <ChangePill value={top.pool.change24h} />
          </div>
        </Link>
      ) : (
        <div className="fchip f2" hidden />
      )}
    </>
  );
}

export function Hero() {
  const t = useT();
  return (
    <div className="card hero">
      <div className="hero-aura" />
      <div className="hero-floor" />
      <PixelCity />
      <FloatChips />
      <div className="hero-copy">
        <div className="eyebrow">
          <span className="live" aria-hidden="true" />
          {t.home.eyebrow} <b>×</b> {t.home.eyebrowB}
        </div>
        <h1>
          <b className="l1" style={{ fontWeight: 'inherit', display: 'block' }}>
            {t.home.h1a}
          </b>
          <span>{t.home.h1b}</span>
        </h1>
        <p className="lede">{t.home.lede}</p>
        <div className="cta">
          <ButtonLink size="lg" href="/create">
            {t.home.createPool} <ArrowIcon />
          </ButtonLink>
          <Button
            variant="glass"
            size="lg"
            onClick={() =>
              document.getElementById('movers')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' })
            }
          >
            {t.home.exploreMovers}
          </Button>
        </div>
        {env.contractAddress && (
          <div className="ca">
            <span className="tag">CA</span>
            <span className="addr-t">{env.contractAddress}</span>
            <button className="icon-btn" onClick={() => copyText(env.contractAddress!, t.common.copied)} aria-label={t.home.copyCa}>
              <CopyIcon />
            </button>
          </div>
        )}
        <div className="venues-row">
          {t.home.routes} <span className="v">Raydium</span>
          <span className="v">Meteora</span>
          <span className="v">Orca</span>
          <span className="v">Jupiter</span>
        </div>
      </div>
    </div>
  );
}
