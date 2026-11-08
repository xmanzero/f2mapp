import { Suspense } from "react";
import { Market } from "@/components/market";
import { pageMeta } from "@/i18n/meta";
import { getI18n } from "@/i18n/server";
import { publicListings } from "@/lib/server-data";

export const generateMetadata = () => pageMeta("/cho", (t) => t.pages.market, { desc: (t) => t.seo.market });

/**
 * Tin đang bán tải sẵn trên máy chủ: HTML có danh sách thật cho Google và lần mở đầu.
 * Đọc ?q= ở đây để máy chủ dựng cả danh sách theo từng lượt xem (dữ liệu lấy từ bộ đệm vài phút).
 */
async function WithData({ searchParams }: { searchParams: PageProps<"/[lang]/cho">["searchParams"] }) {
  await searchParams;
  return <Market initial={await publicListings()} />;
}

// Market đọc tham số trên địa chỉ (useSearchParams) nên cần Suspense khi bật cacheComponents
export default async function Page({ searchParams }: PageProps<"/[lang]/cho">) {
  const { t } = await getI18n();
  return (
    <Suspense fallback={<div className="title-row"><div><h1>{t.pages.market}</h1><p className="sub">{t.common.loading}</p></div></div>}>
      <WithData searchParams={searchParams} />
    </Suspense>
  );
}
