import { Leaderboard } from "@/components/leaderboard";
import { pageMeta } from "@/i18n/meta";

export const generateMetadata = () => pageMeta("/xep-hang", (t) => t.pages.board, { desc: (t) => t.seo.board });

export default function Page() {
  return <Leaderboard />;
}
