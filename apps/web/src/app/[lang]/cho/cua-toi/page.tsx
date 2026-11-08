import { MyListings } from "@/components/my-listings";
import { pageMeta } from "@/i18n/meta";

export const generateMetadata = () => pageMeta("/cho/cua-toi", (t) => t.pages.myListings, { robots: { index: false, follow: false } });

export default function Page() {
  return <MyListings />;
}
