import Link from 'next/link';
import { getLocale, getT } from '@/i18n/server';
import { social } from '@/lib/site';
import { BrandMark } from './BrandMark';
import { LanguageSwitch } from './LanguageSwitch';

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
            <LanguageSwitch locale={getLocale()} label={t.footer.language} />
          </div>
          <div>
            <h2>{t.footer.product}</h2>
            <Link href="/explore">{t.footer.explore}</Link>
            <Link href="/create">{t.footer.create}</Link>
            <Link href="/dashboard">{t.footer.dashboard}</Link>
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
            <a href={social.x}>X</a>
            <a href={social.telegram}>Telegram</a>
            <a href={social.discord}>Discord</a>
          </div>
        </div>
        <div className="fbot">
          {/* Remove once M2 wires real data (brief, ground rule 7). */}
          <span>{t.footer.sample}</span>
          <span>{t.footer.nfa}</span>
        </div>
      </div>
    </footer>
  );
}
