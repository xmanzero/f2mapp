/** Kiểu và giá trị mặc định của Thương hiệu — dùng được cả ở máy chủ lẫn trình duyệt */
/** Ảnh thương hiệu do quản trị viên tải lên (null = dùng bộ mặc định PCDEX Brand Kit) */
export interface BrandAsset { url: string; mime: string; width: number; height: number }
export interface Branding {
  siteName: string; slogan: string; description: string;
  logo: BrandAsset | null; logoLight: BrandAsset | null; favicon: BrandAsset | null;
}

export const DEFAULT_BRANDING: Branding = {
  siteName: "pcdex",
  slogan: "Mạng xã hội PC",
  description: "Khai báo cấu hình PC, xem điểm sức mạnh và hạng, tìm điểm nghẽn, gợi ý nâng cấp, mua bán linh kiện cũ.",
  logo: null, logoLight: null, favicon: null,
};

