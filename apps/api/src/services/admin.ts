import { sql } from "kysely";
import type { DB } from "../db.js";

export class AdminError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function isAdmin(db: DB, userId: string) {
  const u = await db.selectFrom("users").select(["role", "banned_at"]).where("id", "=", userId).executeTakeFirst();
  return !!u && u.role === "admin" && !u.banned_at;
}

export async function logAction(db: DB, admin: { id: string; handle: string }, action: string, target: string | null, detail?: object) {
  await db.insertInto("admin_log").values({
    admin_id: admin.id, admin_handle: admin.handle, action, target, detail: detail ? JSON.stringify(detail) : null,
  }).execute();
}

export async function stats(db: DB) {
  const n = async (q: Promise<{ n: string | number | bigint } | undefined>) => Number((await q)?.n ?? 0);
  const count = (t: "users" | "machines" | "listings" | "scans") => db.selectFrom(t).select((eb) => eb.fn.countAll<string>().as("n"));
  const day = new Date(Date.now() - 86_400_000);
  return {
    users: await n(count("users").executeTakeFirst()),
    usersToday: await n(count("users").where("created_at", ">", day).executeTakeFirst()),
    banned: await n(count("users").where("banned_at", "is not", null).executeTakeFirst()),
    machines: await n(count("machines").executeTakeFirst()),
    scannedMachines: await n(count("machines").where("last_scan_at", "is not", null).executeTakeFirst()),
    listingsLive: await n(count("listings").where("status", "in", ["active", "reserved"]).executeTakeFirst()),
    listingsToday: await n(count("listings").where("created_at", ">", day).executeTakeFirst()),
    listingsRemoved: await n(count("listings").where("removed_at", "is not", null).executeTakeFirst()),
    scansToday: await n(count("scans").where("created_at", ">", day).executeTakeFirst()),
  };
}

// ---------- người dùng ----------
export async function listUsers(db: DB, opts: { q?: string; filter?: "all" | "banned" | "admin"; limit?: number; offset?: number }) {
  let q = db.selectFrom("users as u")
    .select([
      "u.id", "u.handle", "u.display_name", "u.email", "u.province", "u.role", "u.banned_at", "u.ban_reason", "u.created_at",
      (eb) => eb.selectFrom("machines").select((e) => e.fn.countAll<string>().as("n")).whereRef("owner_id", "=", "u.id").as("machines"),
      (eb) => eb.selectFrom("listings").select((e) => e.fn.countAll<string>().as("n")).whereRef("seller_id", "=", "u.id").as("listings"),
      (eb) => eb.selectFrom("sessions").select((e) => e.fn.max("last_seen_at").as("m")).whereRef("user_id", "=", "u.id").as("last_seen"),
      (eb) => eb.selectFrom("user_identities").select((e) => e.fn.countAll<string>().as("n")).whereRef("user_id", "=", "u.id").where("provider", "=", "google").as("google"),
      sql<boolean>`u.password_hash is not null`.as("has_password"),
    ]);
  const term = opts.q?.trim().toLowerCase().replace(/^@/, "");
  if (term) {
    const like = `%${term.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    q = q.where((eb) => eb.or([eb("u.handle", "ilike", like), eb("u.display_name", "ilike", like), eb("u.email", "ilike", like)]));
  }
  if (opts.filter === "banned") q = q.where("u.banned_at", "is not", null);
  if (opts.filter === "admin") q = q.where("u.role", "=", "admin");
  const rows = await q.orderBy("u.created_at", "desc").limit(Math.min(opts.limit ?? 50, 200)).offset(opts.offset ?? 0).execute();
  return rows.map((r) => ({
    id: r.id, handle: r.handle, displayName: r.display_name, email: r.email, province: r.province, role: r.role,
    bannedAt: r.banned_at, banReason: r.ban_reason, createdAt: r.created_at, lastSeenAt: r.last_seen ?? null,
    machines: Number(r.machines ?? 0), listings: Number(r.listings ?? 0),
    providers: [...(r.has_password ? ["password"] : []), ...(Number(r.google) ? ["google"] : [])],
  }));
}

async function target(db: DB, id: string) {
  const u = await db.selectFrom("users").select(["id", "handle", "role", "banned_at"]).where("id", "=", id).executeTakeFirst();
  if (!u) throw new AdminError(404, "Không tìm thấy người dùng");
  return u;
}

/** Khóa: đăng xuất mọi nơi, ẩn tin đang bán, không đăng nhập lại được. Mở khóa: chỉ cho đăng nhập lại (tin giữ ẩn, người bán tự mở). */
export async function setBanned(db: DB, admin: { id: string; handle: string }, userId: string, banned: boolean, reason?: string) {
  const u = await target(db, userId);
  if (u.id === admin.id) throw new AdminError(400, "Không tự khóa tài khoản của mình được.");
  if (banned && u.role === "admin") throw new AdminError(400, "Đây là quản trị viên: bỏ quyền admin trước rồi mới khóa.");
  await db.transaction().execute(async (tx) => {
    await tx.updateTable("users").set({ banned_at: banned ? new Date() : null, ban_reason: banned ? (reason?.trim() || null) : null }).where("id", "=", userId).execute();
    if (banned) {
      await tx.deleteFrom("sessions").where("user_id", "=", userId).execute();
      await tx.updateTable("listings").set({ status: "hidden", updated_at: new Date() }).where("seller_id", "=", userId).where("status", "in", ["active", "reserved"]).execute();
    }
  });
  await logAction(db, admin, banned ? "user.ban" : "user.unban", `@${u.handle}`, reason ? { reason } : undefined);
}

export async function setRole(db: DB, admin: { id: string; handle: string }, userId: string, role: "user" | "admin") {
  const u = await target(db, userId);
  if (u.id === admin.id) throw new AdminError(400, "Không tự đổi quyền của mình được (nhờ quản trị viên khác).");
  await db.updateTable("users").set({ role }).where("id", "=", userId).execute();
  await logAction(db, admin, "user.role", `@${u.handle}`, { role });
}

export async function deleteUser(db: DB, admin: { id: string; handle: string }, userId: string) {
  const u = await target(db, userId);
  if (u.id === admin.id) throw new AdminError(400, "Xóa tài khoản của chính mình ở trang Tài khoản.");
  if (u.role === "admin") throw new AdminError(400, "Đây là quản trị viên: bỏ quyền admin trước rồi mới xóa.");
  await db.deleteFrom("users").where("id", "=", userId).execute();
  await logAction(db, admin, "user.delete", `@${u.handle}`);
}

// ---------- tin rao ----------
const partBack = (db: DB, partId: string) =>
  db.updateTable("machine_parts").set({ status: "replaced" }).where("id", "=", partId).where("status", "=", "for_sale").execute();

export async function listAllListings(db: DB, opts: { q?: string; status?: string; limit?: number; offset?: number }) {
  let q = db.selectFrom("listings as l").innerJoin("users as u", "u.id", "l.seller_id")
    .leftJoin("parts as p", "p.id", "l.part_id")
    .select([
      "l.id", "l.kind", "l.title", "p.name as part_name", "l.price_vnd", "l.status", "l.province", "l.created_at", "l.expires_at",
      "l.removed_at", "l.removed_reason", "l.description", "u.id as seller_id", "u.handle as seller_handle", "u.display_name as seller_name", "u.banned_at",
      (eb) => eb.selectFrom("listing_photos").select((e) => e.fn.countAll<string>().as("n")).whereRef("listing_id", "=", "l.id").as("photos"),
    ]);
  if (opts.status === "removed") q = q.where("l.removed_at", "is not", null);
  else if (opts.status === "live") q = q.where("l.status", "in", ["active", "reserved"]);
  else if (opts.status && ["sold", "hidden", "expired"].includes(opts.status)) q = q.where("l.status", "=", opts.status as "sold");
  const term = opts.q?.trim().toLowerCase().replace(/^@/, "");
  if (term) {
    const like = `%${term.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    q = q.where((eb) => eb.or([eb("l.title", "ilike", like), eb("p.name", "ilike", like), eb("u.handle", "ilike", like), eb("l.description", "ilike", like)]));
  }
  const rows = await q.orderBy("l.created_at", "desc").limit(Math.min(opts.limit ?? 50, 200)).offset(opts.offset ?? 0).execute();
  return rows.map((r) => ({
    id: r.id, kind: r.kind, name: r.title ?? r.part_name ?? "", priceVnd: Number(r.price_vnd), status: r.status, province: r.province,
    createdAt: r.created_at, expiresAt: r.expires_at, removedAt: r.removed_at, removedReason: r.removed_reason,
    photos: Number(r.photos ?? 0), description: r.description,
    seller: { id: r.seller_id, handle: r.seller_handle, displayName: r.seller_name, banned: !!r.banned_at },
  }));
}

/** Gỡ tin vi phạm (ẩn khỏi chợ, người bán thấy lý do, không tự mở lại được) hoặc khôi phục */
export async function moderateListing(db: DB, admin: { id: string; handle: string }, id: string, remove: boolean, reason?: string) {
  const l = await db.selectFrom("listings").select(["id", "status", "title", "machine_part_id", "part_was_in_use"]).where("id", "=", id).executeTakeFirst();
  if (!l) throw new AdminError(404, "Không tìm thấy tin");
  // tin của linh kiện đã thay ra bị gỡ: linh kiện về kho (giống người bán tự ẩn tin)
  if (remove && l.machine_part_id && !l.part_was_in_use && l.status !== "sold")
    await partBack(db, l.machine_part_id);
  if (remove)
    await db.updateTable("listings").set({ removed_at: new Date(), removed_reason: reason?.trim() || "Vi phạm điều khoản",
      status: l.status === "active" || l.status === "reserved" ? "hidden" : l.status, updated_at: new Date() }).where("id", "=", id).execute();
  else
    await db.updateTable("listings").set({ removed_at: null, removed_reason: null, updated_at: new Date() }).where("id", "=", id).execute();
  await logAction(db, admin, remove ? "listing.remove" : "listing.restore", id, { title: l.title, ...(reason ? { reason } : {}) });
}

export async function deleteListing(db: DB, admin: { id: string; handle: string }, id: string) {
  const l = await db.selectFrom("listings").select(["id", "title", "machine_part_id", "status", "part_was_in_use"]).where("id", "=", id).executeTakeFirst();
  if (!l) throw new AdminError(404, "Không tìm thấy tin");
  await db.deleteFrom("listings").where("id", "=", id).execute();
  if (l.machine_part_id && !l.part_was_in_use && l.status !== "sold") await partBack(db, l.machine_part_id);
  await logAction(db, admin, "listing.delete", id, { title: l.title });
}

export async function recentLog(db: DB, limit = 50) {
  return db.selectFrom("admin_log").select(["id", "admin_handle", "action", "target", "detail", "created_at"])
    .orderBy("created_at", "desc").limit(limit).execute();
}
