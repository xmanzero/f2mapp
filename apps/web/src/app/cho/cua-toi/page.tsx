import type { Metadata } from "next";
import { MyListings } from "@/components/my-listings";

export const metadata: Metadata = { title: "Tin của tôi" };

export default function Page() {
  return <MyListings />;
}
