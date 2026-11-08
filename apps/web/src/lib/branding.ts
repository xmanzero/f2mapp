import { cacheLife, cacheTag } from "next/cache";

import { brandFor, DEFAULT_BRANDING, type BrandAsset, type Branding } from "./branding-shared";

export { brandFor, DEFAULT_BRANDING, type BrandAsset, type Branding };

/**
 * Thương hiệu hiện tại (sửa ở /quan-tri?tab=thuong-hieu). Lưu đệm theo nhãn "branding":
 * trang quản trị gọi /brand-refresh sau khi lưu để áp dụng ngay; không thì tự làm mới sau tối đa 1 giờ.
 * API không trả lời (lúc build, API tắt) thì dùng mặc định.
 */
export async function getBranding(): Promise<Branding> {
  "use cache";
  cacheLife("hours");
  cacheTag("branding");
  try {
    const r = await fetch(`${process.env.API_URL ?? "http://localhost:8140"}/v1/branding`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return DEFAULT_BRANDING;
    const b = (await r.json()) as Partial<Record<keyof Branding, unknown>>;
    return {
      siteName: (b.siteName as string) || DEFAULT_BRANDING.siteName,
      slogan: typeof b.slogan === "string" ? b.slogan : DEFAULT_BRANDING.slogan,
      description: (b.description as string) || DEFAULT_BRANDING.description,
      sloganEn: typeof b.sloganEn === "string" ? b.sloganEn : null,
      descriptionEn: (b.descriptionEn as string) || null,
      logo: (b.logo as BrandAsset) ?? null, logoLight: (b.logoLight as BrandAsset) ?? null, favicon: (b.favicon as BrandAsset) ?? null,
    };
  } catch {
    return DEFAULT_BRANDING;
  }
}
