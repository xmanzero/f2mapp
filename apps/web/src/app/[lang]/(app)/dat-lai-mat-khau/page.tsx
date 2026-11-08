import { Suspense } from "react";
import { ResetPassword } from "@/components/recover";
import { pageMeta } from "@/i18n/meta";
import { getI18n } from "@/i18n/server";

export const generateMetadata = () => pageMeta("/dat-lai-mat-khau", (t) => t.pages.resetPassword, { robots: { index: false, follow: false } });

// Đọc tham số trên địa chỉ (useSearchParams) nên cần Suspense khi bật cacheComponents
export default async function Page() {
  const { t } = await getI18n();
  return (
    <Suspense fallback={<div className="title-row"><div><h1>{t.pages.resetPassword}</h1><p className="sub">{t.common.loading}</p></div></div>}>
      <ResetPassword />
    </Suspense>
  );
}
