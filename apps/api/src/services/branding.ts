import sharp from "sharp";
import { z } from "zod";
import type { DB } from "../db.js";

/**
 * Thương hiệu sửa được trong trang quản trị: tên web, slogan, mô tả (app_settings "branding") và ảnh (bảng brand_assets).
 * Chưa đặt gì thì web dùng bộ mặc định (PCDEX Brand Kit trong mã web) — API trả null cho phần đó.
 */
export class BrandingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const BRAND_KINDS = ["logo", "logo_light", "favicon"] as const;
export type BrandKind = (typeof BRAND_KINDS)[number];
export const isBrandKind = (k: string): k is BrandKind => (BRAND_KINDS as readonly string[]).includes(k);
export const MAX_BRAND_BYTES = 1024 * 1024;
export const FAVICON_SIZES = [16, 32, 48, 64, 180, 192, 512] as const;

export const brandingInput = z.object({
  siteName: z.string().trim().min(1, "Nhập tên web").max(40, "Tên web tối đa 40 ký tự"),
  slogan: z.string().trim().max(80, "Slogan tối đa 80 ký tự"),
  description: z.string().trim().max(300, "Mô tả tối đa 300 ký tự"),
  /** bản tiếng Anh (trang /en); bỏ trống = câu mặc định của web */
  sloganEn: z.string().trim().max(80, "Slogan tối đa 80 ký tự").optional(),
  descriptionEn: z.string().trim().max(300, "Mô tả tối đa 300 ký tự").optional(),
});
export type BrandingText = z.infer<typeof brandingInput>;

async function textOf(db: DB): Promise<Partial<BrandingText>> {
  const r = await db.selectFrom("app_settings").select("value").where("key", "=", "branding").executeTakeFirst();
  return (r?.value as Partial<BrandingText> | undefined) ?? {};
}

/** Cấu hình công khai (web đọc lúc dựng trang). Trường null = dùng mặc định của web. */
export async function getBranding(db: DB) {
  const t = await textOf(db);
  const assets = await db.selectFrom("brand_assets").select(["kind", "mime", "width", "height", "updated_at"]).execute();
  const a = (k: BrandKind) => {
    const r = assets.find((x) => x.kind === k);
    return r ? { url: `/api/v1/branding/asset/${k}?v=${new Date(r.updated_at).getTime().toString(36)}`, mime: r.mime, width: r.width, height: r.height } : null;
  };
  return {
    siteName: t.siteName || null, slogan: t.slogan ?? null, description: t.description || null,
    sloganEn: t.sloganEn || null, descriptionEn: t.descriptionEn || null,
    logo: a("logo"), logoLight: a("logo_light"), favicon: a("favicon"),
  };
}

export async function saveBrandingText(db: DB, input: BrandingText, adminId: string) {
  await db.insertInto("app_settings").values({ key: "branding", value: JSON.stringify(input), updated_by: adminId })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value: JSON.stringify(input), updated_at: new Date(), updated_by: adminId })).execute();
}

/** SVG do quản trị viên tải lên vẫn phải sạch: không script, không sự kiện, không tải tài nguyên ngoài */
export function unsafeSvg(svg: string) {
  if (/<script|<foreignObject|<!ENTITY|<!DOCTYPE|<iframe|<embed|<object/i.test(svg)) return "SVG có script hoặc phần nhúng không được phép.";
  if (/\son\w+\s*=/i.test(svg)) return "SVG có thuộc tính sự kiện (onload, onclick…) không được phép.";
  if (/(?:href|src)\s*=\s*["']\s*(?!#|data:image\/)/i.test(svg) || /javascript:/i.test(svg)) return "SVG có liên kết tới tài nguyên ngoài (chỉ cho phép #id hoặc data:image).";
  if (/url\(\s*["']?\s*(?!#)/i.test(svg)) return "SVG có url() tới tài nguyên ngoài.";
  return null;
}

/** Kiểm tra và chuẩn hóa ảnh tải lên. Logo: giữ SVG, ảnh thường đổi WebP cao tối đa 240px. Favicon: PNG vuông 512px. */
export async function prepareAsset(kind: BrandKind, mime: string, buf: Buffer) {
  if (buf.length > MAX_BRAND_BYTES) throw new BrandingError(413, "Ảnh tối đa 1 MB.");
  const isSvg = mime === "image/svg+xml";
  if (isSvg) {
    const err = unsafeSvg(buf.toString("utf8"));
    if (err) throw new BrandingError(400, err);
  }
  let meta;
  try {
    meta = await sharp(buf, { failOn: "error", limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new BrandingError(400, "Không đọc được ảnh. Dùng SVG, PNG hoặc WebP.");
  }
  if (!meta.width || !meta.height) throw new BrandingError(400, "Không đọc được kích thước ảnh.");

  if (kind === "favicon") {
    if (Math.min(meta.width, meta.height) < 48 && !isSvg) throw new BrandingError(400, "Favicon cần tối thiểu 48×48 px (nên dùng 512×512 hoặc SVG).");
    const ratio = meta.width / meta.height;
    if (ratio < 0.8 || ratio > 1.25) throw new BrandingError(400, "Favicon nên là ảnh vuông (tỉ lệ gần 1:1).");
    const data = await sharp(buf, { density: isSvg ? 512 : undefined }).resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return { mime: "image/png", data, width: 512, height: 512 };
  }

  const ratio = meta.width / meta.height;
  if (ratio < 0.8 || ratio > 12) throw new BrandingError(400, "Logo nên là ảnh ngang (rộng gấp 1–12 lần cao).");
  if (isSvg) return { mime: "image/svg+xml", data: buf, width: meta.width, height: meta.height };
  if (meta.height < 40) throw new BrandingError(400, "Logo cần cao tối thiểu 40 px (nên 120 px trở lên, hoặc SVG).");
  const out = await sharp(buf).resize({ height: Math.min(240, meta.height), withoutEnlargement: true }).webp({ quality: 92, alphaQuality: 100 }).toBuffer({ resolveWithObject: true });
  return { mime: "image/webp", data: out.data, width: out.info.width, height: out.info.height };
}

export async function saveAsset(db: DB, kind: BrandKind, a: { mime: string; data: Buffer; width: number; height: number }, adminId: string) {
  const v = { mime: a.mime, data: a.data, width: a.width, height: a.height, updated_by: adminId };
  await db.insertInto("brand_assets").values({ kind, ...v })
    .onConflict((oc) => oc.column("kind").doUpdateSet({ ...v, updated_at: new Date() })).execute();
}
export async function deleteAsset(db: DB, kind: BrandKind) {
  await db.deleteFrom("brand_assets").where("kind", "=", kind).execute();
}

const resized = new Map<string, Buffer>();
/** Ảnh để phục vụ; favicon thu nhỏ theo `size` (giữ trong bộ nhớ theo phiên bản) */
export async function loadAsset(db: DB, kind: BrandKind, size?: number) {
  const r = await db.selectFrom("brand_assets").select(["mime", "data", "updated_at"]).where("kind", "=", kind).executeTakeFirst();
  if (!r) return null;
  if (kind !== "favicon" || !size || size >= 512) return { mime: r.mime, data: r.data };
  const key = `${new Date(r.updated_at).getTime()}-${size}`;
  let data = resized.get(key);
  if (!data) {
    data = await sharp(r.data).resize(size, size).png().toBuffer();
    if (resized.size > 50) resized.clear();
    resized.set(key, data);
  }
  return { mime: "image/png", data };
}
