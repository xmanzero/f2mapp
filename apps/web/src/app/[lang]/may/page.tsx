import { MyMachine } from "@/components/my-machine";
import { pageMeta } from "@/i18n/meta";

export const generateMetadata = () => pageMeta("/may", (t) => t.pages.machine);

export default function Page() {
  return <MyMachine />;
}
