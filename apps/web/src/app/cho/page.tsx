import type { Metadata } from "next";
import { Suspense } from "react";
import { Market } from "@/components/market";

export const metadata: Metadata = { title: "Chợ linh kiện" };

// Market đọc ?q= (useSearchParams) nên cần Suspense khi bật cacheComponents
export default function Page() {
  return (
    <Suspense fallback={<div className="title-row"><div><h1>Chợ linh kiện</h1><p className="sub">Đang tải…</p></div></div>}>
      <Market />
    </Suspense>
  );
}
