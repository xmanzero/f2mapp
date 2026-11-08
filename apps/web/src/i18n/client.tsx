"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { DEFAULT_LOCALE, type Locale } from "./config";
import { makeI18n } from "./index";

const Ctx = createContext<Locale>(DEFAULT_LOCALE);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

/** Trong Client Component: `const { t, p, n0 } = useI18n()` */
export function useI18n() {
  const locale = useContext(Ctx);
  return useMemo(() => makeI18n(locale), [locale]);
}
