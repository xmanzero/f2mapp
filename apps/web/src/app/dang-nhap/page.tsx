import type { Metadata } from "next";
import { Suspense } from "react";
import { Login } from "@/components/login";

export const metadata: Metadata = { title: "Đăng nhập" };

// Login đọc ?next= (useSearchParams) nên cần Suspense khi bật cacheComponents
export default function Page() {
  return (
    <Suspense fallback={<div className="title-row"><div><h1>Đăng nhập</h1></div></div>}>
      <Login />
    </Suspense>
  );
}
