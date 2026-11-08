import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { localizePartLabel } from "@f2m/shared";
import { ListingDetail } from "@/components/listing-detail";
import { LOCALES, localePath } from "@/i18n/config";
import { socialMeta } from "@/i18n/meta";
import { getI18n } from "@/i18n/server";
import type { Listing } from "@/lib/listings";
import { idFromSlug, listingPath } from "@/lib/listing-url";
import { publicListing } from "@/lib/server-data";
import { SITE_URL } from "@/lib/site";

/**
 * Trang riêng của một tin rao: /cho/<tên-linh-kiện>-<tỉnh>-<id> (và /en/cho/…).
 * Máy chủ dựng sẵn HTML (tên, giá, tình trạng, ảnh, mô tả) + schema.org Product để Google hiện giá trong kết quả.
 */
const live = (l: Listing) => l.status === "active" || l.status === "reserved";
const photo = (id: string) => `${SITE_URL}/api/v1/photos/${id}`;

async function load(slug: string) {
  const id = idFromSlug(slug);
  return id ? publicListing(id) : null;
}

export async function generateMetadata({ params }: PageProps<"/[lang]/cho/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { t, locale, vnd } = await getI18n();
  const l = await load(slug);
  if (!l) return { title: t.pages.listing, robots: { index: false, follow: true } };
  const name = localizePartLabel(l.name, locale);
  const title = `${name} · ${vnd(l.priceVnd)}`;
  // câu tóm tắt (tên, tình trạng, giá, tỉnh) + lời người bán, cắt ở ~160 ký tự cho kết quả tìm kiếm
  const summary = t.seo.listingDesc(name, t.listing.condition[l.condition]!, vnd(l.priceVnd), l.province);
  const own = l.description?.trim().replace(/\s+/g, " ");
  const full = own ? `${summary.split(". ")[0]}. ${own}` : summary;
  const description = full.length > 160 ? `${full.slice(0, 157).replace(/\s+\S*$/, "")}…` : full;
  const path = listingPath(l);
  const social = socialMeta(locale, localePath(locale, path), `${title} · pcdex`, description);
  if (l.photos[0]) {
    const img = [{ url: photo(l.photos[0]), alt: name }];
    social.openGraph = { ...social.openGraph, images: img };
    social.twitter = { ...social.twitter, images: img.map((i) => i.url) };
  }
  return {
    title, description, ...social,
    alternates: { canonical: localePath(locale, path), languages: Object.fromEntries(LOCALES.map((x) => [x, localePath(x, path)])) },
    // tin đã bán / hết hạn: vẫn mở được nhưng không đưa vào kết quả tìm kiếm
    robots: live(l) ? undefined : { index: false, follow: true },
  };
}

const ITEM_CONDITION: Record<string, string> = {
  new: "https://schema.org/NewCondition", like_new: "https://schema.org/UsedCondition",
  used: "https://schema.org/UsedCondition", for_parts: "https://schema.org/DamagedCondition",
};

async function Body({ params }: { params: PageProps<"/[lang]/cho/[slug]">["params"] }) {
  const { slug } = await params;
  const { locale, t } = await getI18n();
  const l = await load(slug);
  if (!l) notFound();
  // tên / tỉnh đổi → địa chỉ đổi: chuyển hẳn về địa chỉ đúng
  const path = listingPath(l);
  if (`/cho/${slug}` !== path) permanentRedirect(localePath(locale, path));
  const name = localizePartLabel(l.name, locale);
  const ld = {
    "@context": "https://schema.org", "@type": "Product",
    name, category: t.listing.kind[l.kind],
    ...(l.description ? { description: l.description } : {}),
    ...(l.photos.length ? { image: l.photos.map(photo) } : {}),
    offers: {
      "@type": "Offer", url: `${SITE_URL}${localePath(locale, path)}`, price: l.priceVnd, priceCurrency: "VND",
      availability: live(l) ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      itemCondition: ITEM_CONDITION[l.condition], ...(live(l) ? { priceValidUntil: l.expiresAt.slice(0, 10) } : {}),
      seller: { "@type": "Person", name: l.seller.displayName },
      ...(l.province ? { availableAtOrFrom: { "@type": "Place", address: { "@type": "PostalAddress", addressRegion: l.province, addressCountry: "VN" } } } : {}),
    },
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <ListingDetail initial={l} />
    </>
  );
}

export default async function Page({ params }: PageProps<"/[lang]/cho/[slug]">) {
  const { t } = await getI18n();
  return (
    <Suspense fallback={<div className="title-row"><div><h1>{t.pages.listing}</h1><p className="sub">{t.common.loading}</p></div></div>}>
      <Body params={params} />
    </Suspense>
  );
}
