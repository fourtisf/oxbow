'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_LOCALE, type Locale } from './config';
import { en, type Messages } from './en';

const Ctx = createContext<Locale>(DEFAULT_LOCALE);

/** Set by the root layout from the request's locale, so SSR and the client agree. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export const useLocale = () => useContext(Ctx);
export const useT = (): Messages => en;

/** Non-React access (stores, toasts after async work). */
export function currentT(): Messages {
  return en;
}
