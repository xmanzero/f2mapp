/**
 * Ảnh tin rao: tối đa 5 ảnh / tin, mỗi ảnh tối đa 3 MB (trình duyệt đã thu nhỏ trước khi gửi).
 * Nhận diện định dạng bằng chữ ký tệp (không tin Content-Type), bỏ EXIF của JPEG (vị trí GPS, máy chụp…).
 */
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

/** Bỏ các đoạn APP1 (EXIF / XMP) của JPEG; giữ nguyên phần ảnh. Tệp lạ thì trả lại như cũ. */
export function stripJpegMeta(b: Buffer): Buffer {
  const out: Buffer[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return b;
    const marker = b[i + 1]!;
    if (marker === 0xda) { out.push(b.subarray(i)); return Buffer.concat(out); } // bắt đầu dữ liệu ảnh
    const len = b.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > b.length) return b;
    if (marker !== 0xe1) out.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return b;
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
  const data = mime === "image/jpeg" ? stripJpegMeta(body) : body;
  return db.transaction().execute(async (tx) => {
    const t = tx as unknown as DB;
    // khóa tin để hai lần tải song song không vượt 5 ảnh
    await t.selectFrom("listings").select("id").where("id", "=", listingId).forUpdate().execute();
    const have = await t.selectFrom("listing_photos").select(["position"]).where("listing_id", "=", listingId).execute();
    if (have.length >= MAX_PHOTOS) throw new ListingError(409, `Mỗi tin tối đa ${MAX_PHOTOS} ảnh`);
    const position = have.reduce((m, r) => Math.max(m, r.position + 1), 0);
    const row = await t.insertInto("listing_photos").values({ listing_id: listingId, position, mime, size_bytes: data.length, data })
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
