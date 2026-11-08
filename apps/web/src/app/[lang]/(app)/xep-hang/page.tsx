import { Leaderboard } from "@/components/leaderboard";
import { pageMeta } from "@/i18n/meta";
import { publicBoard } from "@/lib/server-data";

export const generateMetadata = () => pageMeta("/xep-hang", (t) => t.pages.board, { desc: (t) => t.seo.board });

/** Bảng xếp hạng tải sẵn trên máy chủ: HTML có danh sách thật cho Google và lần mở đầu */
export default async function Page() {
  return <Leaderboard initial={await publicBoard()} />;
}
