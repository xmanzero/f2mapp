import type { Metadata } from "next";
import { Suspense } from "react";
import { Admin } from "@/components/admin";

export const metadata: Metadata = { title: "Quản trị", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={<div className="title-row"><div><h1>Quản trị</h1><p className="sub">Đang tải…</p></div></div>}>
      <Admin />
    </Suspense>
  );
}
