/** Địa chỉ gốc công khai của web (link tuyệt đối trong sitemap, Open Graph, schema.org) */
export const SITE_URL = (process.env.WEB_URL ?? "https://pcdex.app").replace(/\/+$/, "");

/** Trang công khai cho Google (mỗi trang có bản tiếng Việt và tiếng Anh) */
export const PUBLIC_PAGES = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/cho", priority: 0.9, changeFrequency: "hourly" },
  { path: "/xep-hang", priority: 0.8, changeFrequency: "daily" },
  { path: "/may", priority: 0.7, changeFrequency: "monthly" },
  { path: "/quet", priority: 0.5, changeFrequency: "monthly" },
  { path: "/chinh-sach-quyen-rieng-tu", priority: 0.2, changeFrequency: "yearly" },
  { path: "/dieu-khoan", priority: 0.2, changeFrequency: "yearly" },
] as const;

/** Trang riêng tư / thao tác: không cho lập chỉ mục */
export const PRIVATE_PATHS = ["/quan-tri", "/tai-khoan", "/cho/dang-tin", "/cho/cua-toi", "/dat-lai-mat-khau", "/quen-mat-khau", "/xac-minh-email", "/dang-nhap"];
