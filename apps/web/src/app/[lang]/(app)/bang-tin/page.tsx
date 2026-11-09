import { Suspense } from "react";
import { Feed } from "@/components/feed";
import { pageMeta } from "@/i18n/meta";
import { getI18n } from "@/i18n/server";

export const generateMetadata = () => pageMeta("/bang-tin", (t) => t.feed.title, { robots: { index: false, follow: false } });

export default async function Page() {
  const { t } = await getI18n();
  return (
    <Suspense fallback={<div className="title-row"><div><h1>{t.feed.title}</h1></div></div>}>
      <Feed />
    </Suspense>
  );
}
