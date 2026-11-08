import { Suspense } from "react";
import { VerifyEmailLanding } from "@/components/recover";
import { pageMeta } from "@/i18n/meta";
import { getI18n } from "@/i18n/server";

export const generateMetadata = () => pageMeta("/xac-minh-email", (t) => t.pages.verifyEmail, { robots: { index: false, follow: false } });

// Đọc tham số trên địa chỉ (useSearchParams) nên cần Suspense khi bật cacheComponents
export default async function Page() {
  const { t } = await getI18n();
  return (
    <Suspense fallback={<div className="title-row"><div><h1>{t.pages.verifyEmail}</h1><p className="sub">{t.common.loading}</p></div></div>}>
      <VerifyEmailLanding />
    </Suspense>
  );
}
