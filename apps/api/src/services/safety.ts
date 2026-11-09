import { sql } from "kysely";
import type { DB } from "../db.js";

export class SafetyError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const REPORT_REASONS = ["spam", "scam", "harassment", "inappropriate", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
/** Mỗi người gửi tối đa ngần này báo cáo / ngày */
const MAX_REPORTS_PER_DAY = 10;

async function userId(db: DB, handle: string) {
  if (!/^[a-z0-9._-]{2,40}$/i.test(handle)) return null;
  return (await db.selectFrom("users").select("id").where(sql<string>`lower(handle)`, "=", handle.toLowerCase()).executeTakeFirst())?.id ?? null;
}

/** Một trong hai người đã chặn người kia */
export async function blockedEither(db: DB, a: string, b: string) {
  const r = await db.selectFrom("user_blocks").select("blocker_id")
    .where((eb) => eb.or([eb.and([eb("blocker_id", "=", a), eb("blocked_id", "=", b)]), eb.and([eb("blocker_id", "=", b), eb("blocked_id", "=", a)])]))
    .executeTakeFirst();
  return !!r;
}

/** Mình đã chặn người này chưa */
export async function iBlocked(db: DB, me: string, other: string) {
  return !!(await db.selectFrom("user_blocks").select("blocker_id").where("blocker_id", "=", me).where("blocked_id", "=", other).executeTakeFirst());
}

/** Chặn: gỡ theo dõi hai chiều và thông báo theo dõi chưa đọc giữa hai người */
export async function setBlock(db: DB, me: string, handle: string, on: boolean) {
  const other = await userId(db, handle);
  if (!other) throw new SafetyError(404, "Không tìm thấy người dùng");
  if (other === me) throw new SafetyError(400, "Không tự chặn chính mình được");
  if (on) {
    await db.transaction().execute(async (tx) => {
      await tx.insertInto("user_blocks").values({ blocker_id: me, blocked_id: other }).onConflict((oc) => oc.doNothing()).execute();
      await tx.deleteFrom("follows").where((eb) => eb.or([
        eb.and([eb("follower_id", "=", me), eb("followee_id", "=", other)]), eb.and([eb("follower_id", "=", other), eb("followee_id", "=", me)]),
      ])).execute();
      await tx.deleteFrom("notifications").where("user_id", "=", me).where("actor_id", "=", other).where("read_at", "is", null).execute();
    });
  } else await db.deleteFrom("user_blocks").where("blocker_id", "=", me).where("blocked_id", "=", other).execute();
  return { blocked: on };
}

export async function listBlocks(db: DB, me: string) {
  return db.selectFrom("user_blocks as b").innerJoin("users as u", "u.id", "b.blocked_id")
    .select(["u.handle", "u.display_name as displayName", "b.created_at as since"]).where("b.blocker_id", "=", me).orderBy("b.created_at", "desc").execute();
}

/**
 * Báo cáo người dùng (kèm hội thoại nếu báo cáo từ trong hội thoại — quản trị viên đọc được hội thoại đó).
 * block: chặn luôn người bị báo cáo.
 */
export async function createReport(db: DB, me: string, input: { handle: string; conversationId?: string; reason: ReportReason; note?: string; block?: boolean }) {
  const target = await userId(db, input.handle);
  if (!target) throw new SafetyError(404, "Không tìm thấy người dùng");
  if (target === me) throw new SafetyError(400, "Không tự báo cáo chính mình được");
  if (input.conversationId) {
    const c = await db.selectFrom("conversations").select(["a_id", "b_id"]).where("id", "=", input.conversationId).executeTakeFirst();
    const pair = c ? [c.a_id, c.b_id] : [];
    if (!pair.includes(me) || !pair.includes(target)) throw new SafetyError(404, "Không tìm thấy hội thoại");
  }
  const today = await db.selectFrom("reports").select((eb) => eb.fn.countAll<string>().as("n"))
    .where("reporter_id", "=", me).where("created_at", ">", new Date(Date.now() - 86_400_000)).executeTakeFirstOrThrow();
  if (Number(today.n) >= MAX_REPORTS_PER_DAY) throw new SafetyError(429, "Bạn đã gửi nhiều báo cáo hôm nay, thử lại sau");
  const r = await db.insertInto("reports").values({
    reporter_id: me, target_id: target, conversation_id: input.conversationId ?? null, reason: input.reason,
    note: input.note?.trim().slice(0, 1000) || null, resolved_by: null, resolved_at: null, resolution_note: null,
  }).returning("id").executeTakeFirstOrThrow();
  if (input.block) await setBlock(db, me, input.handle, true);
  return r.id;
}

// ---------- quản trị ----------

export async function listReports(db: DB, status: "open" | "closed") {
  let q = db.selectFrom("reports as r")
    .innerJoin("users as t", "t.id", "r.target_id")
    .leftJoin("users as p", "p.id", "r.reporter_id")
    .select([
      "r.id", "r.reason", "r.note", "r.status", "r.created_at", "r.conversation_id", "r.resolution_note", "r.resolved_at",
      "t.id as targetId", "t.handle as targetHandle", "t.display_name as targetName", "t.banned_at as targetBanned",
      "p.handle as reporterHandle", "p.display_name as reporterName",
      (eb) => eb.selectFrom("reports as x").select((e) => e.fn.countAll<string>().as("n")).whereRef("x.target_id", "=", "r.target_id").as("targetReports"),
    ]);
  q = status === "open" ? q.where("r.status", "=", "open") : q.where("r.status", "!=", "open");
  return (await q.orderBy("r.created_at", "desc").limit(100).execute()).map((r) => ({ ...r, targetReports: Number(r.targetReports ?? 0), targetBanned: !!r.targetBanned }));
}

/** Một báo cáo + toàn bộ hội thoại liên quan (tối đa 300 tin gần nhất) */
export async function reportDetail(db: DB, id: string) {
  const r = (await listReportsById(db, id));
  if (!r) return null;
  const messages = r.conversation_id ? (await db.selectFrom("messages as m").innerJoin("users as u", "u.id", "m.sender_id")
    .leftJoin("message_images as i", "i.id", "m.image_id")
    .select(["m.id", "m.body", "m.created_at", "u.handle", "u.display_name", "m.sender_id", "i.id as imageId", "i.width", "i.height"])
    .where("m.conversation_id", "=", r.conversation_id).orderBy("m.created_at", "desc").limit(300).execute()).reverse()
    .map((m) => ({
      id: m.id, body: m.body, createdAt: m.created_at, sender: { handle: m.handle, displayName: m.display_name }, isTarget: m.sender_id === r.targetId,
      image: m.imageId ? { id: m.imageId, width: m.width!, height: m.height! } : null,
    })) : [];
  return { report: r, messages };
}

async function listReportsById(db: DB, id: string) {
  const rows = await db.selectFrom("reports as r").innerJoin("users as t", "t.id", "r.target_id").leftJoin("users as p", "p.id", "r.reporter_id")
    .select(["r.id", "r.reason", "r.note", "r.status", "r.created_at", "r.conversation_id", "r.resolution_note", "r.resolved_at",
      "t.id as targetId", "t.handle as targetHandle", "t.display_name as targetName", "t.banned_at as targetBanned",
      "p.handle as reporterHandle", "p.display_name as reporterName"])
    .where("r.id", "=", id).executeTakeFirst();
  return rows ? { ...rows, targetBanned: !!rows.targetBanned } : null;
}

export async function resolveReport(db: DB, adminId: string, id: string, status: "resolved" | "dismissed", note?: string) {
  const r = await db.updateTable("reports").set({ status, resolved_by: adminId, resolved_at: new Date(), resolution_note: note?.trim().slice(0, 500) || null })
    .where("id", "=", id).returning("target_id").executeTakeFirst();
  if (!r) throw new SafetyError(404, "Không tìm thấy báo cáo");
  return r.target_id;
}

/** Quản trị viên xem ảnh trong hội thoại: chỉ khi hội thoại đó đang / từng bị báo cáo */
export async function adminCanSeeConversation(db: DB, conversationId: string) {
  return !!(await db.selectFrom("reports").select("id").where("conversation_id", "=", conversationId).executeTakeFirst());
}
