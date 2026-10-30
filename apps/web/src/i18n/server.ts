import 'server-only';
import { DEFAULT_LOCALE, type Locale } from './config';
import { en, type Messages } from './en';

export function getLocale(): Locale {
  return DEFAULT_LOCALE;
}

export function getT(): Messages {
  return en;
}
