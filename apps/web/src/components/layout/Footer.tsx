import Link from 'next/link';
import { getT } from '@/i18n/server';
import { social, xHandle } from '@/lib/site';
import { BrandMark } from './BrandMark';
import { CaChip } from './CaChip';

export function Footer() {
  const t = getT();
  return (
    <footer>
      <div className="wrap">
        <div className="fgrid">
          <div>
            <Link className="brand" href="/">
              <BrandMark size={32} id="oxf" />
              oxbow
            </Link>
            <p>{t.footer.tagline}</p>
          </div>
          <div>
            <h2>{t.footer.product}</h2>
            <Link href="/">{t.footer.feed}</Link>
            <Link href="/wallets">{t.footer.wallets}</Link>
            <Link href="/following">{t.footer.following}</Link>
            <Link href="/status">{t.footer.status}</Link>
          </div>
          <div>
            <h2>{t.footer.resources}</h2>
            <Link href="/docs">{t.footer.docs}</Link>
            <Link href="/docs#d-fees">{t.footer.fees}</Link>
            <Link href="/docs#d-faq">{t.footer.faq}</Link>
            <Link href="/terms">{t.footer.terms}</Link>
            <Link href="/privacy">{t.footer.privacy}</Link>
            <Link href="/risk">{t.footer.risk}</Link>
          </div>
          <div>
            <h2>{t.footer.community}</h2>
            <SocialLink href={social.x} label={xHandle ? `X ${xHandle}` : 'X'} soon={t.footer.soon} />
            <SocialLink href={social.telegram} label="Telegram" soon={t.footer.soon} />
            <CaChip className="foot-ca" />
          </div>
        </div>
        <div className="fbot">
          <span>{t.footer.nfa}</span>
        </div>
      </div>
    </footer>
  );
}

/** An official account, or its name with a "Soon" pill until the link is set. */
function SocialLink({ href, label, soon }: { href: string | null; label: string; soon: string }) {
  if (href)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    );
  return (
    <span className="fsoon">
      {label} <small>{soon}</small>
    </span>
  );
}
