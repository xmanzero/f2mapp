import type { Metadata } from "next";
import { Suspense } from "react";
import { ClaimScan } from "@/components/claim-scan";

export const metadata: Metadata = { title: "Gắn kết quả quét máy" };

export default function Page() {
  return (
    <Suspense fallback={<div className="title-row"><div><h1>Gắn kết quả quét máy</h1><p className="sub">Đang tải…</p></div></div>}>
      <ClaimScan />
    </Suspense>
  );
}
