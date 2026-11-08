import { Suspense } from "react";
import { Market } from "@/components/market";
import { pageMeta } from "@/i18n/meta";
import { getI18n } from "@/i18n/server";

export const generateMetadata = () => pageMeta("/cho", (t) => t.pages.market, { desc: (t) => t.seo.market });

// Đọc tham số trên địa chỉ (useSearchParams) nên cần Suspense khi bật cacheComponents
export default async function Page() {
  const { t } = await getI18n();
  return (
    <Suspense fallback={<div className="title-row"><div><h1>{t.pages.market}</h1><p className="sub">{t.common.loading}</p></div></div>}>
      <Market />
    </Suspense>
  );
}
