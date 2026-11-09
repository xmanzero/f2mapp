import { Suspense } from "react";
import { Inbox } from "@/components/inbox";
import { pageMeta } from "@/i18n/meta";
import { getI18n } from "@/i18n/server";

export const generateMetadata = () => pageMeta("/tin-nhan", (t) => t.msg.title, { robots: { index: false, follow: false } });

export default async function Page() {
  const { t } = await getI18n();
  return (
    <Suspense fallback={<div className="title-row"><div><h1>{t.msg.title}</h1></div></div>}>
      <Inbox />
    </Suspense>
  );
}
