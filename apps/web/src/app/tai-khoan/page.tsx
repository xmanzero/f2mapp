import type { Metadata } from "next";
import { Suspense } from "react";
import { Account } from "@/components/account";

export const metadata: Metadata = { title: "Tài khoản" };

export default function Page() {
  return (
    <Suspense fallback={<div className="title-row"><div><h1>Tài khoản</h1></div></div>}>
      <Account />
    </Suspense>
  );
}
