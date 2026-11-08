import { listingPath } from "@/lib/listing-url";
import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { LOCALES, localePath } from "@/i18n/config";
import { PUBLIC_PAGES, SITE_URL } from "@/lib/site";

const abs = (path: string) => `${SITE_URL}${path === "/" ? "" : path}` || SITE_URL;
const alternates = (path: string) => ({ languages: Object.fromEntries(LOCALES.map((l) => [l, abs(localePath(l, path))])) });

/** Tin rao đang bán (tin thật, không có tin mẫu) */
async function activeListings(): Promise<{ id: string; name: string; province: string | null; createdAt: string; updatedAt?: string }[]> {
  "use cache";
  cacheLife("hours");
  try {
    const r = await fetch(`${process.env.API_URL ?? "http://localhost:8140"}/v1/listings?limit=500`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return [];
    return ((await r.json()) as { items: { id: string; name: string; province: string | null; createdAt: string; updatedAt?: string }[] }).items;
  } catch {
    return [];
  }
}

/** /sitemap.xml: trang công khai (mỗi ngôn ngữ một dòng, kèm bản ngôn ngữ còn lại) + tin rao đang bán */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = PUBLIC_PAGES.flatMap((pg) => LOCALES.map((l) => ({
    url: abs(localePath(l, pg.path)), changeFrequency: pg.changeFrequency, priority: pg.priority, alternates: alternates(pg.path),
  })));
  const listings = (await activeListings()).flatMap((it) => LOCALES.map((l) => ({
    url: abs(localePath(l, listingPath(it))), lastModified: it.updatedAt ?? it.createdAt,
    changeFrequency: "daily" as const, priority: 0.6,
    alternates: { languages: Object.fromEntries(LOCALES.map((x) => [x, abs(localePath(x, listingPath(it)))])) },
  })));
  return [...pages, ...listings];
}
