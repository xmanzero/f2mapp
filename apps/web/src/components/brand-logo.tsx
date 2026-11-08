import type { Branding } from "@/lib/branding-shared";
import { Mark, Wordmark } from "./mark";

/**
 * Logo ngang: ảnh quản trị viên tải lên (có bản nền sáng thì tự đổi theo chế độ Ngày / Đêm), chưa có thì logo mặc định.
 * `height` là chiều cao hiển thị.
 */
export function BrandLogo({ brand, height = 30 }: { brand: Branding; height?: number }) {
  if (!brand.logo) return <Wordmark size={height} />;
  const img = (a: NonNullable<Branding["logo"]>, cls: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={a.url} alt="" className={cls} height={height} width={Math.round(height * a.width / a.height)} style={{ height, width: "auto" }} />
  );
  return (
    <span className="brand-logo">
      {img(brand.logo, brand.logoLight ? "logo-on-dark" : "logo-any")}
      {brand.logoLight && img(brand.logoLight, "logo-on-light")}
    </span>
  );
}

/** Biểu tượng nhỏ (thanh trên điện thoại): favicon đã tải lên, chưa có thì symbol P */
export function BrandMark({ brand, size = 30 }: { brand: Branding; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (brand.favicon) return <img src={brand.favicon.url.replace(/\?/, "?s=64&")} alt="" width={size} height={size} style={{ borderRadius: 7 }} />;
  return <Mark size={size} />;
}
