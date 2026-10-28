'use client';

import { useSetLocale } from '@/i18n/client';
import { LOCALES, type Locale } from '@/i18n/config';
import { track } from '@/lib/analytics';
import { GlobeIcon } from '../ui/Icons';

const SHORT: Record<Locale, string> = { en: 'EN', id: 'ID' };
const NAME: Record<Locale, string> = { en: 'English', id: 'Bahasa Indonesia' };

/** EN / ID toggle in the footer. Locale is passed from the server so SSR matches. */
export function LanguageSwitch({ locale, label }: { locale: Locale; label: string }) {
  const setLocale = useSetLocale();
  return (
    <div className="lang" role="group" aria-label={label}>
      <GlobeIcon />
      {LOCALES.map((l) => (
        <button
          key={l}
          lang={l}
          aria-pressed={l === locale}
          onClick={() => {
            if (l === locale) return;
            track('language_changed', { to: l });
            setLocale(l);
          }}
        >
          {/* The visible code starts the accessible name (WCAG 2.5.3), the full name follows for screen readers. */}
          {SHORT[l]}
          <span className="sr-only"> {NAME[l]}</span>
        </button>
      ))}
    </div>
  );
}
