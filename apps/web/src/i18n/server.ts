import { lang } from "next/root-params";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";
import { makeI18n } from "./index";

/** Ngôn ngữ của trang đang dựng (Server Component) */
export async function getLocale(): Promise<Locale> {
  const l = await lang();
  return isLocale(l) ? l : DEFAULT_LOCALE;
}
export async function getI18n() {
  return makeI18n(await getLocale());
}
