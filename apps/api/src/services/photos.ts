/**
 * Ảnh tin rao: tối đa 5 ảnh / tin, mỗi ảnh gửi lên tối đa 3 MB (trình duyệt đã thu nhỏ trước khi gửi).
 * Nhận diện định dạng bằng chữ ký tệp (không tin Content-Type). Máy chủ xoay đúng chiều, thu về cạnh dài 1600 px,
 * đóng dấu "F2m" góc dưới phải rồi lưu WebP (nhẹ hơn JPEG ~30%); mọi metadata (EXIF, vị trí GPS…) bị bỏ.
 */
import sharp from "sharp";
import type { DB } from "../db.js";
import { ListingError } from "./listings.js";

export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
type Mime = "image/jpeg" | "image/png" | "image/webp";

export function sniff(b: Uint8Array): Mime | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 12 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export const WATERMARK = "F2m";
const MAX_SIDE = 1600;

/** Dấu "F2m": chữ trắng trên viên nền tối mờ (đọc được trên mọi nền), góc dưới phải; cao ~4% cạnh ngắn của ảnh */
function watermarkSvg(w: number, h: number) {
  const size = Math.max(16, Math.round(Math.min(w, h) * 0.04));
  const padX = Math.round(size * 0.5), padY = Math.round(size * 0.28), margin = Math.round(size * 0.6);
  const pillW = Math.round(size * 2.05) + padX * 2, pillH = size + padY * 2;
  const boxW = pillW + margin, boxH = pillH + margin;
  return {
    svg: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${boxW}" height="${boxH}">
      <rect x="0" y="0" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="#000000" fill-opacity="0.42"/>
      <text x="${pillW / 2}" y="${padY + size * 0.84}" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif"
        font-weight="700" font-size="${size}" fill="#ffffff" fill-opacity="0.92">${WATERMARK}</text></svg>`),
    boxW, boxH,
  };
}

/** Ảnh gửi lên → WebP đã đóng dấu, không metadata */
export async function processPhoto(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input, { failOn: "error", limitInputPixels: 50_000_000 }).rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }).toBuffer({ resolveWithObject: true });
  const mark = watermarkSvg(info.width, info.height);
  const fits = mark.boxW < info.width && mark.boxH < info.height;
  return sharp(data).composite(fits ? [{ input: mark.svg, gravity: "southeast" }] : []).webp({ quality: 80, effort: 4 }).toBuffer();
}

/** Ảnh đăng trước khi có WebP + dấu: xử lý lại (chạy lúc API khởi động) */
export async function processPending(db: DB) {
  const rows = await db.selectFrom("listing_photos").select(["id", "data"]).where("processed", "=", false).execute();
  for (const r of rows) {
    try {
      const out = await processPhoto(Buffer.from(r.data));
      await db.updateTable("listing_photos").set({ data: out, mime: "image/webp", size_bytes: out.length, processed: true }).where("id", "=", r.id).execute();
    } catch {
      await db.updateTable("listing_photos").set({ processed: true }).where("id", "=", r.id).execute(); // ảnh hỏng: giữ nguyên, không thử lại
    }
  }
  return rows.length;
}

async function ownListing(db: DB, userId: string, listingId: string) {
  const l = await db.selectFrom("listings").select(["seller_id", "status"]).where("id", "=", listingId).executeTakeFirst();
  if (!l) throw new ListingError(404, "Không tìm thấy tin");
  if (l.seller_id !== userId) throw new ListingError(403, "Đây không phải tin của bạn");
  if (l.status === "sold") throw new ListingError(409, "Tin đã bán, không sửa ảnh được nữa");
}

export async function photoIds(db: DB, listingIds: string[]) {
  const map = new Map<string, string[]>();
  if (!listingIds.length) return map;
  const rows = await db.selectFrom("listing_photos").select(["id", "listing_id"])
    .where("listing_id", "in", listingIds).orderBy("position").orderBy("created_at").execute();
  for (const r of rows) map.set(r.listing_id, [...(map.get(r.listing_id) ?? []), r.id]);
  return map;
}

export async function addPhoto(db: DB, userId: string, listingId: string, body: Buffer) {
  await ownListing(db, userId, listingId);
  if (body.length > MAX_PHOTO_BYTES) throw new ListingError(413, "Ảnh quá lớn (tối đa 3 MB)");
  const mime = sniff(body);
  if (!mime) throw new ListingError(415, "Chỉ nhận ảnh JPEG, PNG hoặc WebP");
  let data: Buffer;
  try { data = await processPhoto(body); } catch { throw new ListingError(415, "Không đọc được ảnh này. Thử ảnh JPEG hoặc PNG khác."); }
  return db.transaction().execute(async (tx) => {
    const t = tx as unknown as DB;
    // khóa tin để hai lần tải song song không vượt 5 ảnh
    await t.selectFrom("listings").select("id").where("id", "=", listingId).forUpdate().execute();
    const have = await t.selectFrom("listing_photos").select(["position"]).where("listing_id", "=", listingId).execute();
    if (have.length >= MAX_PHOTOS) throw new ListingError(409, `Mỗi tin tối đa ${MAX_PHOTOS} ảnh`);
    const position = have.reduce((m, r) => Math.max(m, r.position + 1), 0);
    const row = await t.insertInto("listing_photos").values({ listing_id: listingId, position, mime: "image/webp", size_bytes: data.length, data, processed: true })
      .returning("id").executeTakeFirstOrThrow();
    return row.id;
  });
}

export async function deletePhoto(db: DB, userId: string, listingId: string, photoId: string) {
  await ownListing(db, userId, listingId);
  const r = await db.deleteFrom("listing_photos").where("id", "=", photoId).where("listing_id", "=", listingId).executeTakeFirst();
  if (!Number(r.numDeletedRows)) throw new ListingError(404, "Không tìm thấy ảnh");
}

/** Sắp lại thứ tự ảnh; ảnh đầu tiên là ảnh bìa trên chợ */
export async function orderPhotos(db: DB, userId: string, listingId: string, ids: string[]) {
  await ownListing(db, userId, listingId);
  const have = (await db.selectFrom("listing_photos").select("id").where("listing_id", "=", listingId).execute()).map((r) => r.id);
  if (ids.length !== have.length || !ids.every((id) => have.includes(id))) throw new ListingError(400, "Danh sách ảnh không khớp");
  await db.transaction().execute(async (tx) => {
    for (const [i, id] of ids.entries()) await tx.updateTable("listing_photos").set({ position: i }).where("id", "=", id).execute();
  });
}

export async function getPhoto(db: DB, photoId: string) {
  return db.selectFrom("listing_photos").select(["mime", "data"]).where("id", "=", photoId).executeTakeFirst();
}
