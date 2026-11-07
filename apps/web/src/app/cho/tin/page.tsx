import type { Metadata } from "next";
import { Suspense } from "react";
import { ListingDetail } from "@/components/listing-detail";

export const metadata: Metadata = { title: "Tin rao" };

export default function Page() {
  return (
    <Suspense fallback={<div className="title-row"><div><h1>Tin rao</h1></div></div>}>
      <ListingDetail />
    </Suspense>
  );
}
