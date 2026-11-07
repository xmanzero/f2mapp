import { z } from "zod";
import type { DB } from "../db.js";

export const LISTING_KINDS = ["gpu", "cpu", "ram", "storage", "other"] as const;
export const CONDITIONS = ["new", "like_new", "used", "for_parts"] as const;
export const STATUSES = ["active", "reserved", "sold", "hidden"] as const;
export const MAX_ACTIVE_PER_USER = 20;

export const createListingSchema = z.object({
  kind: z.enum(LISTING_KINDS),
  /** Tên trong danh mục — bắt buộc với card / CPU */
  partName: z.string().max(80).optional(),
  /** Tên tự nhập — bắt buộc với RAM, ổ, khác */
  title: z.string().trim().min(3, "Tên linh kiện từ 3 ký tự").max(80, "Tên linh kiện tối đa 80 ký tự").optional(),
  priceVnd: z.number().int().min(10_000, "Giá từ 10.000 ₫").max(200_000_000, "Giá tối đa 200.000.000 ₫"),
  condition: z.enum(CONDITIONS),
  warrantyMonths: z.number().int().min(0).max(60).nullable().optional(),
  province: z.string().trim().max(40).nullable().optional(),
  description: z.string().trim().max(1000, "Mô tả tối đa 1.000 ký tự").nullable().optional(),
  contact: z.string().trim().min(6, "Nhập số Zalo hoặc điện thoại để người mua liên hệ").max(60),
  /** Đăng từ linh kiện đã thay ra trong máy */
  machinePartId: z.string().uuid().optional(),
});
export type CreateListing = z.infer<typeof createListingSchema>;

export const updateListingSchema = z.object({
  priceVnd: createListingSchema.shape.priceVnd.optional(),
  description: createListingSchema.shape.description,
  contact: createListingSchema.shape.contact.optional(),
  warrantyMonths: createListingSchema.shape.warrantyMonths,
  status: z.enum(STATUSES).optional(),
});

export class ListingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const baseQuery = (db: DB) => db.selectFrom("listings as l")
  .innerJoin("users as u", "u.id", "l.seller_id")
  .leftJoin("parts as p", "p.id", "l.part_id")
  .select([
    "l.id", "l.kind", "l.title", "l.price_vnd", "l.condition", "l.warranty_months", "l.province", "l.description",
    "l.status", "l.created_at", "l.updated_at", "l.sold_at", "l.contact", "l.seller_id",
    "u.handle as seller_handle", "u.display_name as seller_name", "p.name as part_name",
  ]);
type Raw = Awaited<ReturnType<ReturnType<typeof baseQuery>["execute"]>>[number];

/** Dạng trả về cho client; liên hệ chỉ có khi người xem đã đăng nhập */
function shape(r: Raw, viewerId: string | null) {
  return {
    id: r.id, kind: r.kind, name: r.part_name ?? r.title ?? "", partName: r.part_name, inCatalog: !!r.part_name,
    priceVnd: Number(r.price_vnd), condition: r.condition, warrantyMonths: r.warranty_months,
    province: r.province, description: r.description, status: r.status,
    createdAt: r.created_at, updatedAt: r.updated_at, soldAt: r.sold_at,
    seller: { id: r.seller_id, handle: r.seller_handle, displayName: r.seller_name },
    mine: viewerId === r.seller_id,
    contact: viewerId ? r.contact : null,
    contactHidden: !viewerId,
  };
}
export type ListingView = ReturnType<typeof shape>;

export async function listListings(db: DB, opts: { kind?: string; q?: string; limit?: number; viewerId: string | null }) {
  let q = baseQuery(db).where("l.status", "=", "active");
  if (opts.kind && (LISTING_KINDS as readonly string[]).includes(opts.kind)) q = q.where("l.kind", "=", opts.kind as CreateListing["kind"]);
  if (opts.q) {
    const like = `%${opts.q.trim().toLowerCase().replace(/[%_\\]/g, "")}%`;
    q = q.where((eb) => eb.or([eb(eb.fn("lower", ["p.name"]), "like", like), eb(eb.fn("lower", ["l.title"]), "like", like)]));
  }
  const rows = await q.orderBy("l.created_at", "desc").limit(Math.min(opts.limit ?? 100, 200)).execute();
  return rows.map((r) => shape(r, opts.viewerId));
}

export async function getListing(db: DB, id: string, viewerId: string | null) {
  const r = await baseQuery(db).where("l.id", "=", id).executeTakeFirst();
  // tin đã ẩn chỉ người bán thấy
  if (!r || (r.status === "hidden" && r.seller_id !== viewerId)) return null;
  return shape(r, viewerId);
}

export async function myListings(db: DB, userId: string) {
  const rows = await baseQuery(db).where("l.seller_id", "=", userId).orderBy("l.created_at", "desc").execute();
  return rows.map((r) => shape(r, userId));
}

/** Linh kiện đã thay ra khỏi máy chính, chưa đăng bán — gợi ý "Đăng bán" */
export async function replacedParts(db: DB, userId: string) {
  return db.selectFrom("machine_parts as mp")
    .innerJoin("machines as m", "m.id", "mp.machine_id")
    .innerJoin("parts as p", "p.id", "mp.part_id")
    .select(["mp.id", "p.kind", "p.name", "mp.added_at"])
    .where("m.owner_id", "=", userId).where("mp.status", "=", "replaced")
    .orderBy("mp.added_at", "desc").execute();
}

export async function createListing(db: DB, userId: string, input: CreateListing) {
  const active = await db.selectFrom("listings").select((eb) => eb.fn.countAll<string>().as("n"))
    .where("seller_id", "=", userId).where("status", "in", ["active", "reserved"]).executeTakeFirstOrThrow();
  if (Number(active.n) >= MAX_ACTIVE_PER_USER)
    throw new ListingError(409, `Bạn đang có ${MAX_ACTIVE_PER_USER} tin. Đánh dấu đã bán hoặc ẩn bớt tin cũ rồi đăng tiếp.`);

  let partId: string | null = null;
  let title: string | null = null;
  if (input.kind === "gpu" || input.kind === "cpu") {
    if (!input.partName) throw new ListingError(400, input.kind === "gpu" ? "Chọn card đồ họa trong danh sách" : "Chọn CPU trong danh sách");
    const p = await db.selectFrom("parts").select("id").where("kind", "=", input.kind).where("name", "=", input.partName).executeTakeFirst();
    if (!p) throw new ListingError(400, `Không có "${input.partName}" trong danh mục`);
    partId = p.id;
  } else {
    if (!input.title) throw new ListingError(400, "Nhập tên linh kiện, ví dụ: DDR4 16 GB (2×8 GB) 3200 MHz");
    title = input.title;
  }

  return db.transaction().execute(async (tx) => {
    const t = tx as unknown as DB;
    if (input.machinePartId) {
      const mp = await t.selectFrom("machine_parts as mp").innerJoin("machines as m", "m.id", "mp.machine_id")
        .select(["mp.id", "mp.part_id", "mp.status"]).where("mp.id", "=", input.machinePartId).where("m.owner_id", "=", userId)
        .executeTakeFirst();
      if (!mp || mp.part_id !== partId) throw new ListingError(400, "Linh kiện này không có trong máy của bạn");
      if (mp.status !== "replaced") throw new ListingError(409, "Linh kiện này đã được đăng bán");
      await t.updateTable("machine_parts").set({ status: "for_sale" }).where("id", "=", mp.id).execute();
    }
    const row = await t.insertInto("listings").values({
      seller_id: userId, part_id: partId, machine_part_id: input.machinePartId ?? null, kind: input.kind, title,
      price_vnd: input.priceVnd, condition: input.condition, warranty_months: input.warrantyMonths ?? null,
      province: input.province || null, description: input.description || null, contact: input.contact, sold_at: null,
    }).returning("id").executeTakeFirstOrThrow();
    return row.id;
  });
}

const MP_STATUS = { active: "for_sale", reserved: "for_sale", sold: "sold", hidden: "replaced" } as const;

export async function updateListing(db: DB, userId: string, id: string, patch: z.infer<typeof updateListingSchema>) {
  const l = await db.selectFrom("listings").select(["seller_id", "machine_part_id", "status"]).where("id", "=", id).executeTakeFirst();
  if (!l) throw new ListingError(404, "Không tìm thấy tin");
  if (l.seller_id !== userId) throw new ListingError(403, "Đây không phải tin của bạn");
  await db.transaction().execute(async (tx) => {
    const t = tx as unknown as DB;
    await t.updateTable("listings").set({
      ...(patch.priceVnd !== undefined && { price_vnd: patch.priceVnd }),
      ...(patch.description !== undefined && { description: patch.description || null }),
      ...(patch.contact !== undefined && { contact: patch.contact }),
      ...(patch.warrantyMonths !== undefined && { warranty_months: patch.warrantyMonths }),
      ...(patch.status !== undefined && { status: patch.status, sold_at: patch.status === "sold" ? new Date() : null }),
      updated_at: new Date(),
    }).where("id", "=", id).execute();
    if (patch.status && l.machine_part_id)
      await t.updateTable("machine_parts").set({ status: MP_STATUS[patch.status] }).where("id", "=", l.machine_part_id).execute();
  });
}
