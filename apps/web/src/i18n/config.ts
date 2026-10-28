export const LOCALES = ['en', 'id'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'oxbow_locale';

export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', id: 'Bahasa Indonesia' };

/** BCP 47 tags for Intl date formatting. Numbers stay en-US everywhere (trading convention). */
export const INTL_TAG: Record<Locale, string> = { en: 'en-US', id: 'id-ID' };

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALES as readonly string[]).includes(v);

/** First supported language in an Accept-Language header. */
export function pickLocale(acceptLanguage: string | null | undefined): Locale {
  for (const part of (acceptLanguage ?? '').split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase() ?? '';
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
    // "in" is the legacy ISO code for Indonesian.
    if (base === 'in') return 'id';
  }
  return DEFAULT_LOCALE;
}
