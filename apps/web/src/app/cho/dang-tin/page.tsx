import type { Metadata } from "next";
import { Suspense } from "react";
import { PostListing } from "@/components/post-listing";

export const metadata: Metadata = { title: "Đăng tin bán" };

export default function Page() {
  return (
    <Suspense fallback={<div className="title-row"><div><h1>Đăng tin bán</h1></div></div>}>
      <PostListing />
    </Suspense>
  );
}
