import { Suspense } from "react";
import { ClaimScan } from "@/components/claim-scan";
import { pageMeta } from "@/i18n/meta";
import { getI18n } from "@/i18n/server";

export const generateMetadata = () => pageMeta("/quet", (t) => t.pages.scan, { desc: (t) => t.seo.scan });

// Đọc tham số trên địa chỉ (useSearchParams) nên cần Suspense khi bật cacheComponents
export default async function Page() {
  const { t } = await getI18n();
  return (
    <Suspense fallback={<div className="title-row"><div><h1>{t.pages.scan}</h1><p className="sub">{t.common.loading}</p></div></div>}>
      <ClaimScan />
    </Suspense>
  );
}
