import { Suspense } from "react";
import { ListingDetail } from "@/components/listing-detail";
import { pageMeta } from "@/i18n/meta";
import { getI18n } from "@/i18n/server";

export const generateMetadata = () => pageMeta("/cho/tin", (t) => t.pages.listing);

// Đọc tham số trên địa chỉ (useSearchParams) nên cần Suspense khi bật cacheComponents
export default async function Page() {
  const { t } = await getI18n();
  return (
    <Suspense fallback={<div className="title-row"><div><h1>{t.pages.listing}</h1></div></div>}>
      <ListingDetail />
    </Suspense>
  );
}
