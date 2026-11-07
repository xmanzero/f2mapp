import type { Metadata } from "next";
import { Leaderboard } from "@/components/leaderboard";

export const metadata: Metadata = { title: "Bảng xếp hạng" };

export default function Page() {
  return <Leaderboard />;
}
