import type { Metadata } from "next";
import { MyMachine } from "@/components/my-machine";

export const metadata: Metadata = { title: "Máy của tôi" };

export default function Page() {
  return <MyMachine />;
}
