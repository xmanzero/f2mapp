import type { Locale } from "@/i18n/config";
import { en } from "@/i18n/dict/en";
import { vi } from "@/i18n/dict/vi";

/** Kiểu và giá trị mặc định của Thương hiệu — dùng được cả ở máy chủ lẫn trình duyệt */
/** Ảnh thương hiệu do quản trị viên tải lên (null = dùng bộ mặc định PCDEX Brand Kit) */
export interface BrandAsset { url: string; mime: string; width: number; height: number }
export interface Branding {
  siteName: string;
  /** slogan / mô tả tiếng Việt */
  slogan: string; description: string;
  /** bản tiếng Anh; null = dùng câu mặc định trong từ điển */
  sloganEn: string | null; descriptionEn: string | null;
  logo: BrandAsset | null; logoLight: BrandAsset | null; favicon: BrandAsset | null;
}

export const DEFAULT_BRANDING: Branding = {
  siteName: "pcdex",
  slogan: vi.meta.defaultSlogan,
  description: vi.meta.defaultDescription,
  sloganEn: null, descriptionEn: null,
  logo: null, logoLight: null, favicon: null,
};

/** Thương hiệu theo ngôn ngữ trang: `slogan` / `description` là bản của ngôn ngữ đó */
export function brandFor(b: Branding, locale: Locale): Branding {
  if (locale === "vi") return b;
  return { ...b, slogan: b.sloganEn ?? en.meta.defaultSlogan, description: b.descriptionEn ?? en.meta.defaultDescription };
}
