import { Suspense } from "react";
import { PostListing } from "@/components/post-listing";
import { pageMeta } from "@/i18n/meta";
import { getI18n } from "@/i18n/server";

export const generateMetadata = () => pageMeta("/cho/dang-tin", (t) => t.pages.postListing, { robots: { index: false, follow: false } });

// Đọc tham số trên địa chỉ (useSearchParams) nên cần Suspense khi bật cacheComponents
export default async function Page() {
  const { t } = await getI18n();
  return (
    <Suspense fallback={<div className="title-row"><div><h1>{t.pages.postListing}</h1></div></div>}>
      <PostListing />
    </Suspense>
  );
}
