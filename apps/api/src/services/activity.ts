import { SCALE_VERSION } from "@f2m/shared";
import { sql } from "kysely";
import type { DB } from "../db.js";

export type ActivityKind = "machine_added" | "part_changed" | "tier_up" | "listing_posted" | "bench_verified";
/** Cửa sổ gộp: đổi qua lại một linh kiện trong ngần này thời gian chỉ thành một dòng trên bảng tin */
const MERGE_MS = 30 * 60_000;

/** Ghi một hoạt động. Lỗi không làm hỏng thao tác chính (bảng tin là phần phụ). */
export async function logActivity(db: DB, userId: string, kind: ActivityKind, data: Record<string, unknown>, target?: string) {
  try {
    await db.insertInto("activities").values({ user_id: userId, kind, data: JSON.stringify(data), target: target ?? null }).execute();
  } catch { /* bỏ qua */ }
}

/**
 * Đổi linh kiện / lên hạng: gộp với dòng cùng loại, cùng máy trong 30 phút gần nhất (giữ "từ" ban đầu, cập nhật "thành").
 * Đổi về đúng như ban đầu thì xóa dòng (người dùng chỉ thử rồi bỏ).
 */
export async function logChange(db: DB, userId: string, kind: "part_changed" | "tier_up", target: string, from: string, to: string, extra: Record<string, unknown> = {}) {
  try {
    const prev = await db.selectFrom("activities").select(["id", "data"]).where("user_id", "=", userId).where("kind", "=", kind)
      .where("target", "=", target).where("created_at", ">", new Date(Date.now() - MERGE_MS)).orderBy("created_at", "desc").executeTakeFirst();
    if (prev) {
      const first = (prev.data as { from?: string }).from ?? from;
      if (first === to) { await db.deleteFrom("activities").where("id", "=", prev.id).execute(); return; }
      await db.updateTable("activities").set({ data: JSON.stringify({ ...extra, from: first, to }), created_at: new Date() }).where("id", "=", prev.id).execute();
      return;
    }
    if (from !== to) await logActivity(db, userId, kind, { ...extra, from, to }, target);
  } catch { /* bỏ qua */ }
}

/** Bỏ dòng "lên hạng" chưa quá 30 phút khi máy tụt lại (thử cấu hình rồi đổi lại) */
export async function dropRecent(db: DB, userId: string, kind: ActivityKind, target: string) {
  try {
    await db.deleteFrom("activities").where("user_id", "=", userId).where("kind", "=", kind).where("target", "=", target)
      .where("created_at", ">", new Date(Date.now() - MERGE_MS)).execute();
  } catch { /* bỏ qua */ }
}

/**
 * Bảng tin: hoạt động của người mình theo dõi (và của chính mình), mới nhất trước. before: phân trang theo thời điểm.
 * Kèm gợi ý theo dõi (máy mạnh trên bảng xếp hạng mà mình chưa theo dõi) khi theo dõi ít người.
 */
export async function feed(db: DB, viewerId: string, before?: Date, limit = 30) {
  let q = db.selectFrom("activities as a").innerJoin("users as u", "u.id", "a.user_id")
    .select(["a.id", "a.kind", "a.data", "a.created_at", "u.id as userId", "u.handle", "u.display_name"])
    .where("u.banned_at", "is", null)
    .where((eb) => eb.or([
      eb("a.user_id", "=", viewerId),
      eb("a.user_id", "in", eb.selectFrom("follows").select("followee_id").where("follower_id", "=", viewerId)),
    ]));
  if (before) q = q.where("a.created_at", "<", before);
  const rows = await q.orderBy("a.created_at", "desc").limit(limit).execute();
  const following = Number((await db.selectFrom("follows").select((eb) => eb.fn.countAll<string>().as("n")).where("follower_id", "=", viewerId).executeTakeFirstOrThrow()).n);
  return {
    items: rows.map((r) => ({
      id: r.id, kind: r.kind, data: r.data, createdAt: r.created_at, mine: r.userId === viewerId,
      user: { handle: r.handle, displayName: r.display_name },
    })),
    following,
    suggestions: following < 5 ? await suggestions(db, viewerId) : [],
  };
}

/** Gợi ý theo dõi: máy chính điểm cao, chưa theo dõi, không phải mình */
async function suggestions(db: DB, viewerId: string) {
  return db.selectFrom("machines as m").innerJoin("users as u", "u.id", "m.owner_id")
    .innerJoin("machine_scores as s", (j) => j.onRef("s.machine_id", "=", "m.id").on("s.scale_version", "=", SCALE_VERSION))
    .select(["u.handle", "u.display_name as displayName", "u.province", "s.power", "s.tier", "m.form_factor as formFactor"])
    .where("m.is_primary", "=", true).where("u.banned_at", "is", null).where("u.id", "!=", viewerId)
    .where("u.id", "not in", (eb) => eb.selectFrom("follows").select("followee_id").where("follower_id", "=", viewerId))
    .orderBy("s.power", "desc").limit(5).execute();
}

// ---------- thông báo ----------

/** Báo cho người nhận (không báo khi tự làm với mình). Lần trước chưa đọc cùng loại, cùng người, cùng mục thì thay bằng lần mới. */
export async function notify(db: DB, userId: string, actorId: string, kind: "follow" | "like", target: string | null, data: Record<string, unknown> = {}) {
  if (userId === actorId) return;
  try {
    await unnotify(db, userId, actorId, kind, target);
    await db.insertInto("notifications").values({ user_id: userId, actor_id: actorId, kind, target, data: JSON.stringify(data), read_at: null }).execute();
  } catch { /* bỏ qua */ }
}

/** Bỏ theo dõi / bỏ thích: xóa thông báo chưa đọc tương ứng */
export async function unnotify(db: DB, userId: string, actorId: string, kind: "follow" | "like", target: string | null) {
  let q = db.deleteFrom("notifications").where("user_id", "=", userId).where("actor_id", "=", actorId).where("kind", "=", kind).where("read_at", "is", null);
  q = target === null ? q.where("target", "is", null) : q.where("target", "=", target);
  await q.execute();
}

export async function notifications(db: DB, userId: string, limit = 30) {
  const rows = await db.selectFrom("notifications as n").leftJoin("users as u", "u.id", "n.actor_id")
    .select(["n.id", "n.kind", "n.target", "n.data", "n.created_at", "n.read_at", "u.handle", "u.display_name"])
    .where("n.user_id", "=", userId).where((eb) => eb.or([eb("u.banned_at", "is", null), eb("u.id", "is", null)]))
    .orderBy("n.created_at", "desc").limit(limit).execute();
  return {
    items: rows.map((r) => ({
      id: r.id, kind: r.kind, target: r.target, data: r.data, createdAt: r.created_at, read: !!r.read_at,
      actor: r.handle ? { handle: r.handle, displayName: r.display_name } : null,
    })),
    unread: await unreadCount(db, userId),
  };
}

export async function unreadCount(db: DB, userId: string) {
  const r = await db.selectFrom("notifications").select((eb) => eb.fn.countAll<string>().as("n"))
    .where("user_id", "=", userId).where("read_at", "is", null).executeTakeFirstOrThrow();
  return Number(r.n);
}

export async function markAllRead(db: DB, userId: string) {
  await db.updateTable("notifications").set({ read_at: sql`now()` }).where("user_id", "=", userId).where("read_at", "is", null).execute();
}
