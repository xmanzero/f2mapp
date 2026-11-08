import type { Metadata } from "next";
import { LOCALES, localePath, type Locale } from "./config";
import { getI18n } from "./server";
import { makeI18n, type Dict } from "./index";

const OG_LOCALE: Record<Locale, string> = { vi: "vi_VN", en: "en_US" };

/**
 * Open Graph + Twitter cho một trang: ảnh chia sẻ theo ngôn ngữ (public/og/og-<lang>.png, 1200×630).
 * Next thay cả khối openGraph của layout khi trang khai riêng, nên mọi trang đều đi qua hàm này.
 */
export function socialMeta(locale: Locale, url: string, title: string, description: string, siteName = "pcdex"): Pick<Metadata, "openGraph" | "twitter"> {
  const images = [{ url: `/og/og-${locale}.png`, width: 1200, height: 630, alt: makeI18n(locale).t.seo.ogAlt }];
  return {
    openGraph: {
      type: "website", siteName, title, description, url, images,
      locale: OG_LOCALE[locale], alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
    },
    twitter: { card: "summary_large_image", title, description, images: images.map((i) => i.url) },
  };
}

/**
 * Metadata của một trang: tiêu đề và mô tả theo ngôn ngữ, link chuẩn + các bản ngôn ngữ (hreflang), ảnh chia sẻ.
 * `title` / `desc` chọn từ từ điển, VD (t) => t.pages.machine, (t) => t.seo.machine.
 */
export async function pageMeta(path: string, title: (t: Dict) => string, extra: Metadata & { desc?: (t: Dict) => string } = {}): Promise<Metadata> {
  const { t, locale } = await getI18n();
  const { desc, ...rest } = extra;
  const url = localePath(locale, path);
  const description = desc ? desc(t) : t.meta.defaultDescription;
  return {
    title: title(t),
    description,
    alternates: {
      canonical: url,
      languages: { ...Object.fromEntries(LOCALES.map((l) => [l, localePath(l, path)])), "x-default": path },
    },
    ...socialMeta(locale, url, `${title(t)} · pcdex`, description),
    ...rest,
  };
}

/** Tiêu đề trang khi đang tải (Suspense) */
export async function pageTitle(title: (t: Dict) => string) {
  const { t } = await getI18n();
  return title(t);
}
