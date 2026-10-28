'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from './config';
import { en, type Messages } from './en';
import { id } from './id';

const CATALOGS: Record<Locale, Messages> = { en, id };
const Ctx = createContext<Locale>(DEFAULT_LOCALE);

/** Set by the root layout from the request's locale, so SSR and the client agree. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export const useLocale = () => useContext(Ctx);
export const useT = (): Messages => CATALOGS[useContext(Ctx)];

/** Non-React access (stores, toasts after async work). Reads the <html lang> the server rendered. */
export function currentT(): Messages {
  const l = typeof document !== 'undefined' ? document.documentElement.lang : DEFAULT_LOCALE;
  return CATALOGS[l === 'id' ? 'id' : 'en'];
}

/** Switch language: remember it for a year and re-render server components. */
export function useSetLocale() {
  const router = useRouter();
  return useCallback(
    (l: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = l;
      router.refresh();
    },
    [router],
  );
}
