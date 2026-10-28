import Link from 'next/link';
import { social } from '@/lib/site';
import { FooterMark } from './BrandMark';

export function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div className="fgrid">
          <div>
            <Link className="brand" href="/">
              <FooterMark />
              Oxbow
            </Link>
            <p>Stock-paired liquidity pools for any token on Solana.</p>
          </div>
          <div>
            <h2>Product</h2>
            <Link href="/explore">Explore</Link>
            <Link href="/create">Create pool</Link>
            <Link href="/dashboard">Dashboard</Link>
          </div>
          <div>
            <h2>Resources</h2>
            <Link href="/docs">Docs</Link>
            <Link href="/docs#d-fees">Fees</Link>
            <Link href="/docs#d-faq">FAQ</Link>
          </div>
          <div>
            <h2>Community</h2>
            <a href={social.x}>X</a>
            <a href={social.telegram}>Telegram</a>
            <a href={social.discord}>Discord</a>
          </div>
        </div>
        <div className="fbot">
          {/* Remove once M2 wires real data (brief, ground rule 7). */}
          <span>Oxbow prototype. Pools, prices and volumes shown are sample data.</span>
          <span>Not financial advice. Trading tokens carries risk.</span>
        </div>
      </div>
    </footer>
  );
}
