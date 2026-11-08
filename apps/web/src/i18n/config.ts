/**
 * Ngôn ngữ của web. Tiếng Việt là mặc định, giữ địa chỉ không tiền tố (pcdex.app/may);
 * ngôn ngữ khác có tiền tố (pcdex.app/en/may). Thêm ngôn ngữ: thêm mã vào LOCALES, thêm tệp từ điển (xem dict.ts).
 */
export const LOCALES = ["vi", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "vi";
export const LOCALE_NAMES: Record<Locale, string> = { vi: "Tiếng Việt", en: "English" };
/** Mã cho Intl (số, ngày, tiền) */
export const INTL_LOCALE: Record<Locale, string> = { vi: "vi-VN", en: "en-US" };
/** Cookie nhớ ngôn ngữ người dùng chọn */
export const LANG_COOKIE = "f2m_lang";

export const isLocale = (s: string | null | undefined): s is Locale => !!s && (LOCALES as readonly string[]).includes(s);

/** Địa chỉ của `path` (bắt đầu bằng "/") trong ngôn ngữ `locale` */
export function localePath(locale: Locale, path: string) {
  if (locale === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** Ngôn ngữ trang đang mở (đọc từ <html lang>), dùng trong mã không phải component (gọi API, thông báo lỗi) */
export function pageLocale(): Locale {
  const l = typeof document !== "undefined" ? document.documentElement.lang : "";
  return isLocale(l) ? l : DEFAULT_LOCALE;
}

/** Bỏ tiền tố ngôn ngữ khỏi địa chỉ trình duyệt: "/en/may" → { locale: "en", path: "/may" } */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const m = /^\/([a-z]{2})(?=\/|$)(.*)$/.exec(pathname);
  if (m && isLocale(m[1]) && m[1] !== DEFAULT_LOCALE) return { locale: m[1], path: m[2] || "/" };
  return { locale: DEFAULT_LOCALE, path: pathname || "/" };
}
