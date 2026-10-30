/** English only. The message catalog (en.ts) keeps every string in one place. */
export const LOCALES = ['en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** BCP 47 tags for Intl date formatting. */
export const INTL_TAG: Record<Locale, string> = { en: 'en-US' };
