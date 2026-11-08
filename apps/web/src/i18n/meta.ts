import type { Metadata } from "next";
import { LOCALES, localePath } from "./config";
import { getI18n } from "./server";
import type { Dict } from "./index";

/**
 * Metadata của một trang: tiêu đề theo ngôn ngữ + liên kết các bản ngôn ngữ (hreflang) cho Google.
 * `title` chọn từ từ điển, VD (t) => t.pages.machine.
 */
export async function pageMeta(path: string, title: (t: Dict) => string, extra: Metadata = {}): Promise<Metadata> {
  const { t, locale } = await getI18n();
  return {
    title: title(t),
    alternates: {
      canonical: localePath(locale, path),
      languages: { ...Object.fromEntries(LOCALES.map((l) => [l, localePath(l, path)])), "x-default": path },
    },
    ...extra,
  };
}

/** Tiêu đề trang khi đang tải (Suspense) */
export async function pageTitle(title: (t: Dict) => string) {
  const { t } = await getI18n();
  return title(t);
}
