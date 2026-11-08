import { Suspense } from "react";
import { Login } from "@/components/login";
import { pageMeta } from "@/i18n/meta";
import { getI18n } from "@/i18n/server";

export const generateMetadata = () => pageMeta("/dang-nhap", (t) => t.pages.login);

// Đọc tham số trên địa chỉ (useSearchParams) nên cần Suspense khi bật cacheComponents
export default async function Page() {
  const { t } = await getI18n();
  return (
    <Suspense fallback={<div className="title-row"><div><h1>{t.pages.login}</h1></div></div>}>
      <Login />
    </Suspense>
  );
}
