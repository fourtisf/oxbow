import { Feed, HOME_FEED } from '@/components/feed/Feed';
import { Hero } from '@/components/home/Hero';
import { HotTokens } from '@/components/home/HotTokens';
import { TopWallets } from '@/components/home/TopWallets';
import { Hydrate } from '@/lib/api/Hydrate';
import { Prefetch } from '@/lib/api/server';

export default async function HomePage() {
  const pf = new Prefetch();
  await Promise.all([pf.feed(HOME_FEED), pf.hot(), pf.wallets(), pf.status()]);
  return (
    <Hydrate state={pf.state()}>
      <section className="view">
        <div className="wrap">
          <Hero />
          <div className="hgrid">
            <Feed />
            <aside className="hside">
              <HotTokens />
              <TopWallets />
            </aside>
          </div>
        </div>
      </section>
    </Hydrate>
  );
}
