import { INTL_LOCALE, localePath, type Locale } from "./config";
import { en } from "./dict/en";
import { vi } from "./dict/vi";

export type Dict = typeof vi;
const DICTS: Record<Locale, Dict> = { vi, en };

export * from "./config";

/** Bộ công cụ ngôn ngữ: từ điển `t`, địa chỉ theo ngôn ngữ `p`, định dạng số / tiền / ngày theo ngôn ngữ */
export function makeI18n(locale: Locale) {
  const intl = INTL_LOCALE[locale];
  const n0 = (x: number) => Math.round(x).toLocaleString(intl);
  return {
    locale,
    t: DICTS[locale],
    p: (path: string) => localePath(locale, path),
    n0,
    /** Chợ vẫn là chợ Việt Nam: giá luôn bằng đồng */
    vnd: (x: number) => `${n0(x)} ₫`,
    ratio: (x: number) => x.toLocaleString(intl, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    /** 0.123 → "+12%", 0 → "0%" */
    signedPct: (x: number) => { const v = Math.round(x * 100); return v === 0 ? "0%" : `${v > 0 ? "+" : "−"}${Math.abs(v)}%`; },
    date: (d: string | number | Date) => new Date(d).toLocaleDateString(intl),
    dateTime: (d: string | number | Date, o: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) =>
      new Date(d).toLocaleString(intl, o),
  };
}
export type I18n = ReturnType<typeof makeI18n>;
