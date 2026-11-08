import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmailLanding } from "@/components/recover";

export const metadata: Metadata = { title: "Xác minh email", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={<div className="title-row"><div><h1>Xác minh email</h1><p className="sub">Đang tải…</p></div></div>}>
      <VerifyEmailLanding />
    </Suspense>
  );
}
