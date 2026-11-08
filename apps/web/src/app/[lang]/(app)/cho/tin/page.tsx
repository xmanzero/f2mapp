import { permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { ListingDetail } from "@/components/listing-detail";
import { localePath } from "@/i18n/config";
import { pageMeta } from "@/i18n/meta";
import { getI18n } from "@/i18n/server";
import { isListingId, listingPath } from "@/lib/listing-url";
import { publicListing } from "@/lib/server-data";

/**
 * /cho/tin?id=… — địa chỉ cũ của tin rao. Tin thật chuyển hẳn sang địa chỉ riêng /cho/<tên>-<id>;
 * tin mẫu (minh họa chợ, không có trên máy chủ) vẫn mở ở đây và không cho lập chỉ mục.
 */
export const generateMetadata = () => pageMeta("/cho/tin", (t) => t.pages.listing, {
  desc: (t) => t.seo.listing,
  alternates: {},
  robots: { index: false, follow: true },
});

async function Resolve({ searchParams }: { searchParams: PageProps<"/[lang]/cho/tin">["searchParams"] }) {
  const sp = await searchParams;
  const id = typeof sp.id === "string" ? sp.id.toLowerCase() : "";
  if (isListingId(id)) {
    const l = await publicListing(id);
    if (l) {
      const { locale } = await getI18n();
      const fails = typeof sp["loi-anh"] === "string" ? `?loi-anh=${sp["loi-anh"]}` : "";
      permanentRedirect(localePath(locale, listingPath(l)) + fails);
    }
  }
  return <ListingDetail />;
}

export default async function Page({ searchParams }: PageProps<"/[lang]/cho/tin">) {
  const { t } = await getI18n();
  return (
    <Suspense fallback={<div className="title-row"><div><h1>{t.pages.listing}</h1></div></div>}>
      <Resolve searchParams={searchParams} />
    </Suspense>
  );
}
