import { Suspense } from "react";
import { Admin } from "@/components/admin";
import { pageMeta } from "@/i18n/meta";
import { getI18n } from "@/i18n/server";

export const generateMetadata = () => pageMeta("/quan-tri", (t) => t.pages.admin, { robots: { index: false, follow: false } });

// Đọc tham số trên địa chỉ (useSearchParams) nên cần Suspense khi bật cacheComponents
export default async function Page() {
  const { t } = await getI18n();
  return (
    <Suspense fallback={<div className="title-row"><div><h1>{t.pages.admin}</h1><p className="sub">{t.common.loading}</p></div></div>}>
      <Admin />
    </Suspense>
  );
}
