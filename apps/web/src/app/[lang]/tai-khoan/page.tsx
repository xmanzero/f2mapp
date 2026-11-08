import { Suspense } from "react";
import { Account } from "@/components/account";
import { pageMeta } from "@/i18n/meta";
import { getI18n } from "@/i18n/server";

export const generateMetadata = () => pageMeta("/tai-khoan", (t) => t.pages.account, { robots: { index: false, follow: false } });

export default async function Page() {
  const { t } = await getI18n();
  return (
    <Suspense fallback={<div className="title-row"><div><h1>{t.pages.account}</h1></div></div>}>
      <Account />
    </Suspense>
  );
}
