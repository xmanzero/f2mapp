import type { Metadata } from "next";
import { Suspense } from "react";
import { ForgotPassword } from "@/components/recover";

export const metadata: Metadata = { title: "Quên mật khẩu", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={<div className="title-row"><div><h1>Quên mật khẩu</h1><p className="sub">Đang tải…</p></div></div>}>
      <ForgotPassword />
    </Suspense>
  );
}
