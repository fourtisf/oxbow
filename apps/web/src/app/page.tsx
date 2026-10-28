import { Hydrate } from '@/lib/api/Hydrate';
import { CreatePairCard } from '@/components/home/CreatePairCard';
import { Hero } from '@/components/home/Hero';
import { LiveFeed } from '@/components/home/LiveFeed';
import { MoversMarquee, PoolDetailPanel, TopMarkets } from '@/components/home/Markets';
import { CtaBand, HowItWorks, VerifiedStocks } from '@/components/home/Sections';
import { StatCards } from '@/components/home/StatCards';
import { api } from '@/lib/api';
import { TOP_QUERY } from '@/lib/api/presets';
import { Prefetch } from '@/lib/api/server';

export default async function HomePage() {
  const pf = new Prefetch();
  await Promise.all([pf.stats(), pf.movers(), pf.pools(TOP_QUERY), pf.stocks()]);
  // The details panel starts on the top mover.
  const top = (await api.movers())[0];
  if (top) await pf.chart(top.address, '1D');

  return (
    <Hydrate state={pf.state()}>
      <section className="view">
        <div className="wrap">
          <div className="home-top">
            <Hero />
            <div className="side">
              <CreatePairCard />
              <StatCards />
              <LiveFeed />
            </div>
          </div>
          <MoversMarquee />
          <div className="home-mid">
            <TopMarkets />
            <PoolDetailPanel />
          </div>
          <VerifiedStocks />
          <HowItWorks />
          <CtaBand />
        </div>
      </section>
    </Hydrate>
  );
}
