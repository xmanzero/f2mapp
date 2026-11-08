import type { MetadataRoute } from "next";
import { LOCALES, localePath } from "@/i18n/config";
import { PRIVATE_PATHS, SITE_URL } from "@/lib/site";

/** /robots.txt: cho phép mọi trang công khai, chặn trang riêng tư (cả hai ngôn ngữ) và API */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/brand-refresh", ...LOCALES.flatMap((l) => PRIVATE_PATHS.map((p) => localePath(l, p)))],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
