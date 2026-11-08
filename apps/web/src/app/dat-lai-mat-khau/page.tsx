import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPassword } from "@/components/recover";

export const metadata: Metadata = { title: "Đặt lại mật khẩu", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={<div className="title-row"><div><h1>Đặt lại mật khẩu</h1><p className="sub">Đang tải…</p></div></div>}>
      <ResetPassword />
    </Suspense>
  );
}
