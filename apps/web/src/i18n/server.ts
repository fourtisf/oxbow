import 'server-only';
import { cookies, headers } from 'next/headers';
import { isLocale, LOCALE_COOKIE, pickLocale, type Locale } from './config';
import { en, type Messages } from './en';
import { id } from './id';

const CATALOGS: Record<Locale, Messages> = { en, id };

/** The request's locale: the cookie set by the switcher (or middleware), else Accept-Language. */
export function getLocale(): Locale {
  const c = cookies().get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  return pickLocale(headers().get('accept-language'));
}

export function getT(locale: Locale = getLocale()): Messages {
  return CATALOGS[locale];
}
