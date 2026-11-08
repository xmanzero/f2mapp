/**
 * Tin rao. Luật (chốt 08/11/2026): chỉ đăng được linh kiện mình sở hữu — một linh kiện trong máy (đang lắp hoặc đã thay ra);
 * tối đa 5 tin mới mỗi 24 giờ; mỗi linh kiện một tin đang bán. Tin hiện "đã xác thực" khi phần mềm quét máy đã thấy linh kiện.
 */
import { SCALE_VERSION } from "@f2m/shared";
import { z } from "zod";
import type { DB } from "../db.js";
import { photoIds } from "./photos.js";

export const LISTING_KINDS = ["cpu", "gpu", "mainboard", "ram", "storage", "psu"] as const;
export const CONDITIONS = ["new", "like_new", "used", "for_parts"] as const;
export const STATUSES = ["active", "reserved", "sold", "hidden"] as const;
export const MAX_PER_DAY = 5;
/** Thời gian bán người dùng chọn được (ngày) */
export const DURATIONS = [1, 2, 3, 5, 7, 14, 30] as const;
const durationField = z.number().int().refine((d) => (DURATIONS as readonly number[]).includes(d), "Chọn thời gian bán 1, 2, 3, 5, 7, 14 hoặc 30 ngày");
const expiryFrom = (days: number, from = Date.now()) => new Date(from + days * 86_400_000);
const LIVE = ["active", "reserved"] as const;

export const createListingSchema = z.object({
  machinePartId: z.string({ required_error: "Chọn một linh kiện trong máy của bạn để đăng bán" }).uuid("Chọn một linh kiện trong máy của bạn để đăng bán"),
  priceVnd: z.number().int().min(10_000, "Giá từ 10.000 ₫").max(200_000_000, "Giá tối đa 200.000.000 ₫"),
  condition: z.enum(CONDITIONS),
  warrantyMonths: z.number().int().min(0).max(60).nullable().optional(),
  province: z.string().trim().max(40).nullable().optional(),
  description: z.string().trim().max(1000, "Mô tả tối đa 1.000 ký tự").nullable().optional(),
  contact: z.string().trim().min(6, "Nhập số Zalo hoặc điện thoại để người mua liên hệ").max(60),
  durationDays: durationField.default(7),
});
export type CreateListing = z.infer<typeof createListingSchema>;

export const updateListingSchema = z.object({
  priceVnd: createListingSchema.shape.priceVnd.optional(),
  description: createListingSchema.shape.description,
  contact: createListingSchema.shape.contact.optional(),
  warrantyMonths: createListingSchema.shape.warrantyMonths,
  status: z.enum(STATUSES).optional(),
  /** Gia hạn / đăng lại: thời hạn mới tính từ bây giờ */
  durationDays: durationField.optional(),
});

export class ListingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const baseQuery = (db: DB) => db.selectFrom("listings as l")
  .innerJoin("users as u", "u.id", "l.seller_id")
  .leftJoin("parts as p", "p.id", "l.part_id")
  .leftJoin("machine_parts as mp", "mp.id", "l.machine_part_id")
  .leftJoin("machines as m", "m.id", "mp.machine_id")
  .leftJoin("machine_scores as sc", (j) => j.onRef("sc.machine_id", "=", "m.id").on("sc.scale_version", "=", SCALE_VERSION))
  .select([
    "l.id", "l.kind", "l.title", "l.price_vnd", "l.condition", "l.warranty_months", "l.province", "l.description",
    "l.status", "l.created_at", "l.updated_at", "l.sold_at", "l.expires_at", "l.contact", "l.seller_id", "l.part_was_in_use",
    "u.handle as seller_handle", "u.display_name as seller_name", "p.name as part_name",
    "mp.status as part_status", "mp.verified_at as part_verified_at", "mp.added_at as part_added_at", "mp.details as part_details",
    "m.id as machine_id", "m.name as machine_name", "sc.tier as machine_tier", "sc.power as machine_power",
  ]);
type Raw = Awaited<ReturnType<ReturnType<typeof baseQuery>["execute"]>>[number];

async function machineHeadlines(db: DB, machineIds: string[]) {
  if (!machineIds.length) return new Map<string, string>();
  const rows = await db.selectFrom("machine_parts").select(["machine_id", "kind", "label"])
    .where("machine_id", "in", machineIds).where("status", "=", "in_use").where("kind", "in", ["cpu", "gpu"]).execute();
  const map = new Map<string, string>();
  for (const id of machineIds) {
    const cpu = rows.find((r) => r.machine_id === id && r.kind === "cpu")?.label;
    const gpu = rows.find((r) => r.machine_id === id && r.kind === "gpu")?.label;
    map.set(id, [cpu, gpu].filter(Boolean).join(" + "));
  }
  return map;
}

/** Dạng trả về cho client; liên hệ chỉ có khi người xem đã đăng nhập */
function shape(r: Raw, viewerId: string | null, headlines: Map<string, string>, photos: Map<string, string[]> = new Map()) {
  return {
    id: r.id, kind: r.kind, name: r.title ?? r.part_name ?? "", partName: r.part_name, inCatalog: !!r.part_name,
    priceVnd: Number(r.price_vnd), condition: r.condition, warrantyMonths: r.warranty_months,
    province: r.province, description: r.description, status: r.status,
    createdAt: r.created_at, updatedAt: r.updated_at, soldAt: r.sold_at, expiresAt: r.expires_at,
    seller: { id: r.seller_id, handle: r.seller_handle, displayName: r.seller_name },
    /** Linh kiện này trong máy người bán */
    source: r.machine_id ? {
      machineName: r.machine_name, machine: headlines.get(r.machine_id) ?? "", tier: r.machine_tier, power: r.machine_power,
      inUse: r.part_was_in_use, installedAt: r.part_added_at,
      verified: !!r.part_verified_at && r.part_status === "in_use", verifiedAt: r.part_verified_at,
      details: r.part_details,
    } : null,
    /** id ảnh theo thứ tự, ảnh đầu là ảnh bìa; tải ở GET /photos/:id */
    photos: photos.get(r.id) ?? [],
    mine: viewerId === r.seller_id,
    contact: viewerId ? r.contact : null,
    contactHidden: !viewerId,
  };
}
export type ListingView = ReturnType<typeof shape>;

async function shapeAll(db: DB, rows: Raw[], viewerId: string | null) {
  const heads = await machineHeadlines(db, [...new Set(rows.map((r) => r.machine_id).filter((x): x is string => !!x))]);
  const photos = await photoIds(db, rows.map((r) => r.id));
  return rows.map((r) => shape(r, viewerId, heads, photos));
}

/**
 * Tin hết hạn tự hủy: chuyển 'expired', linh kiện đã thay ra về kho (replaced); linh kiện đang lắp vẫn trong máy.
 * Chạy định kỳ (index.ts) và trước mỗi lần đọc chợ, nên không có tin quá hạn nào lọt ra ngoài.
 */
export async function expireListings(db: DB) {
  const gone = await db.updateTable("listings").set({ status: "expired", updated_at: new Date() })
    .where("status", "in", LIVE).where("expires_at", "<=", new Date())
    .returning(["id", "machine_part_id", "part_was_in_use"]).execute();
  const back = gone.filter((l) => l.machine_part_id && !l.part_was_in_use).map((l) => l.machine_part_id!);
  if (back.length) await db.updateTable("machine_parts").set({ status: "replaced" }).where("id", "in", back).where("status", "=", "for_sale").execute();
  return gone.length;
}

export async function listListings(db: DB, opts: { kind?: string; q?: string; limit?: number; viewerId: string | null }) {
  await expireListings(db);
  let q = baseQuery(db).where("l.status", "=", "active").where("l.expires_at", ">", new Date());
  if (opts.kind && (LISTING_KINDS as readonly string[]).includes(opts.kind)) q = q.where("l.kind", "=", opts.kind as (typeof LISTING_KINDS)[number]);
  if (opts.q) {
    const like = `%${opts.q.trim().toLowerCase().replace(/[%_\\]/g, "")}%`;
    q = q.where((eb) => eb(eb.fn("lower", ["l.title"]), "like", like));
  }
  return shapeAll(db, await q.orderBy("l.created_at", "desc").limit(Math.min(opts.limit ?? 100, 200)).execute(), opts.viewerId);
}

export async function getListing(db: DB, id: string, viewerId: string | null) {
  await expireListings(db);
  const r = await baseQuery(db).where("l.id", "=", id).executeTakeFirst();
  // tin đã ẩn / hết hạn chỉ người bán thấy
  if (!r || ((r.status === "hidden" || r.status === "expired") && r.seller_id !== viewerId)) return null;
  return (await shapeAll(db, [r], viewerId))[0]!;
}

export async function myListings(db: DB, userId: string) {
  await expireListings(db);
  return shapeAll(db, await baseQuery(db).where("l.seller_id", "=", userId).orderBy("l.created_at", "desc").execute(), userId);
}

/** Linh kiện bán được: đang lắp hoặc đã thay ra, trong các máy của người dùng, kèm tin đang bán (nếu có) */
/** Mẫu gần đúng chọn khi quét thấy CPU / card chưa có trong danh mục (không phải linh kiện thật) */
export const isSubstitute = (details: unknown) => !!(details as { substituteFor?: string } | null)?.substituteFor;

export async function sellableParts(db: DB, userId: string) {
  const rows = await db.selectFrom("machine_parts as mp")
    .innerJoin("machines as m", "m.id", "mp.machine_id")
    .leftJoin("listings as l", (j) => j.onRef("l.machine_part_id", "=", "mp.id").on("l.status", "in", ["active", "reserved"]))
    .select(["mp.id", "mp.kind", "mp.label", "mp.status", "mp.verified_at", "mp.added_at", "mp.replaced_at", "mp.details",
      "m.id as machine_id", "m.name as machine_name", "m.is_primary", "l.id as listing_id"])
    .where("m.owner_id", "=", userId).where("mp.status", "in", ["in_use", "replaced", "for_sale"])
    .orderBy("m.is_primary", "desc").orderBy("mp.added_at").execute();
  return rows.filter((r) => !isSubstitute(r.details)).map((r) => ({
    id: r.id, kind: r.kind, label: r.label, details: r.details, inUse: r.status === "in_use",
    // "xác thực đang dùng": phần mềm quét đã thấy và linh kiện vẫn còn trong máy
    verified: !!r.verified_at && r.status === "in_use",
    addedAt: r.added_at, replacedAt: r.replaced_at, machineId: r.machine_id, machineName: r.machine_name, isPrimary: r.is_primary,
    listingId: r.listing_id,
  }));
}

export async function createListing(db: DB, userId: string, input: CreateListing) {
  const today = await db.selectFrom("listings").select((eb) => eb.fn.countAll<string>().as("n"))
    .where("seller_id", "=", userId).where("created_at", ">", new Date(Date.now() - 24 * 3600_000)).executeTakeFirstOrThrow();
  if (Number(today.n) >= MAX_PER_DAY)
    throw new ListingError(429, `Mỗi ngày đăng tối đa ${MAX_PER_DAY} tin. Bạn đã đăng đủ trong 24 giờ qua, thử lại sau.`);

  return db.transaction().execute(async (tx) => {
    const t = tx as unknown as DB;
    const mp = await t.selectFrom("machine_parts as mp").innerJoin("machines as m", "m.id", "mp.machine_id")
      .select(["mp.id", "mp.kind", "mp.label", "mp.part_id", "mp.status", "mp.details"])
      .where("mp.id", "=", input.machinePartId).where("m.owner_id", "=", userId).executeTakeFirst();
    if (!mp) throw new ListingError(400, "Chỉ đăng bán được linh kiện có trong máy của bạn. Khai báo linh kiện ở Máy của tôi trước.");
    if (isSubstitute(mp.details))
      throw new ListingError(400, "Đây là mẫu gần đúng thay cho linh kiện chưa có trong danh mục, không phải linh kiện bạn sở hữu nên không đăng bán được.");
    if (mp.status === "sold") throw new ListingError(409, "Linh kiện này đã bán");
    const active = await t.selectFrom("listings").select("id").where("machine_part_id", "=", mp.id)
      .where("status", "in", ["active", "reserved"]).executeTakeFirst();
    if (active) throw new ListingError(409, "Linh kiện này đang có tin bán");
    const inUse = mp.status === "in_use";
    if (!inUse) await t.updateTable("machine_parts").set({ status: "for_sale" }).where("id", "=", mp.id).execute();
    const row = await t.insertInto("listings").values({
      seller_id: userId, part_id: mp.part_id, machine_part_id: mp.id, kind: mp.kind, title: mp.label, part_was_in_use: inUse,
      price_vnd: input.priceVnd, condition: input.condition, warranty_months: input.warrantyMonths ?? null,
      province: input.province || null, description: input.description || null, contact: input.contact, sold_at: null,
      expires_at: expiryFrom(input.durationDays),
    }).returning("id").executeTakeFirstOrThrow();
    return row.id;
  });
}

export async function updateListing(db: DB, userId: string, id: string, patch: z.infer<typeof updateListingSchema>) {
  await expireListings(db);
  const l = await db.selectFrom("listings").select(["seller_id", "machine_part_id", "status", "part_was_in_use", "expires_at"]).where("id", "=", id).executeTakeFirst();
  if (!l) throw new ListingError(404, "Không tìm thấy tin");
  if (l.seller_id !== userId) throw new ListingError(403, "Đây không phải tin của bạn");
  const goingLive = patch.status === "active" || patch.status === "reserved";
  const reopening = goingLive && (l.status === "expired" || l.status === "hidden" || l.status === "sold");
  // mở lại tin đã quá hạn (hết hạn, hoặc hết hạn trong lúc ẩn / đã bán) phải chọn thời gian bán mới
  if (reopening && new Date(l.expires_at).getTime() <= Date.now() && !patch.durationDays)
    throw new ListingError(400, "Tin đã hết hạn. Chọn thời gian bán mới để đăng lại.");
  if (patch.durationDays && !goingLive && l.status !== "active" && l.status !== "reserved")
    throw new ListingError(400, "Chỉ gia hạn được tin đang bán");
  if (reopening && l.machine_part_id) {
    const other = await db.selectFrom("listings").select("id").where("machine_part_id", "=", l.machine_part_id)
      .where("status", "in", ["active", "reserved"]).where("id", "!=", id).executeTakeFirst();
    if (other) throw new ListingError(409, "Linh kiện này đang có tin bán khác");
  }
  await db.transaction().execute(async (tx) => {
    const t = tx as unknown as DB;
    await t.updateTable("listings").set({
      ...(patch.priceVnd !== undefined && { price_vnd: patch.priceVnd }),
      ...(patch.description !== undefined && { description: patch.description || null }),
      ...(patch.contact !== undefined && { contact: patch.contact }),
      ...(patch.warrantyMonths !== undefined && { warranty_months: patch.warrantyMonths }),
      ...(patch.status !== undefined && { status: patch.status, sold_at: patch.status === "sold" ? new Date() : null }),
      ...(patch.durationDays !== undefined && { expires_at: expiryFrom(patch.durationDays) }),
      updated_at: new Date(),
    }).where("id", "=", id).execute();
    if (patch.status && l.machine_part_id) {
      // linh kiện đang lắp: bán xong thì rời máy; còn lại vẫn trong máy
      // linh kiện đã thay ra: đang bán ↔ để trong kho (replaced) ↔ đã bán
      const next = patch.status === "sold" ? "sold"
        : l.part_was_in_use ? "in_use"
        : patch.status === "hidden" ? "replaced" : "for_sale";
      await t.updateTable("machine_parts").set({ status: next }).where("id", "=", l.machine_part_id).execute();
    }
  });
}
