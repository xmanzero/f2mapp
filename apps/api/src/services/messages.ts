import { sql } from "kysely";
import type { DB } from "../db.js";

export class MessageError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Mỗi người gửi tối đa ngần này tin / giờ (chống spam) */
export const MAX_PER_HOUR = 120;
export const MAX_BODY = 2000;

const pair = (x: string, y: string) => (x < y ? [x, y] as const : [y, x] as const);

/**
 * Mở (hoặc dùng lại) hội thoại với người bán của một tin rao, hoặc với một người theo tên.
 * Không nhắn cho mình; người bị khóa không nhận tin.
 */
export async function startConversation(db: DB, me: string, to: { listingId?: string; handle?: string }) {
  let other: string | undefined, listingId: string | null = null;
  if (to.listingId) {
    const l = await db.selectFrom("listings as l").innerJoin("users as u", "u.id", "l.seller_id").select(["l.id", "l.seller_id"])
      .where("l.id", "=", to.listingId).where("u.banned_at", "is", null).where("l.removed_at", "is", null).executeTakeFirst();
    if (!l) throw new MessageError(404, "Không tìm thấy tin");
    other = l.seller_id; listingId = l.id;
  } else if (to.handle) {
    const u = await db.selectFrom("users").select("id").where(sql<string>`lower(handle)`, "=", to.handle.toLowerCase()).where("banned_at", "is", null).executeTakeFirst();
    if (!u) throw new MessageError(404, "Không tìm thấy người dùng");
    other = u.id;
  }
  if (!other) throw new MessageError(400, "Dữ liệu chưa đúng");
  if (other === me) throw new MessageError(400, "Không nhắn tin cho chính mình được");
  const [a, b] = pair(me, other);
  let q = db.selectFrom("conversations").select("id").where("a_id", "=", a).where("b_id", "=", b);
  q = listingId ? q.where("listing_id", "=", listingId) : q.where("listing_id", "is", null);
  const had = await q.executeTakeFirst();
  if (had) return had.id;
  return (await db.insertInto("conversations").values({ a_id: a, b_id: b, listing_id: listingId }).returning("id").executeTakeFirstOrThrow()).id;
}

/** Hội thoại của mình (mới nhất trước): người kia, tin rao (nếu có), tin cuối, số tin chưa đọc */
export async function listConversations(db: DB, me: string) {
  const rows = await db.selectFrom("conversations as c")
    .innerJoin("users as u", (j) => j.on(sql<boolean>`u.id = case when c.a_id = ${me} then c.b_id else c.a_id end`))
    .leftJoin("listings as l", "l.id", "c.listing_id")
    .select([
      "c.id", "c.listing_id", "c.last_message_at", "u.handle", "u.display_name", "u.banned_at",
      "l.title as listing_title", "l.price_vnd", "l.status as listing_status", "l.province as listing_province",
      (eb) => eb.selectFrom("messages as m").select("m.body").whereRef("m.conversation_id", "=", "c.id").orderBy("m.created_at", "desc").limit(1).as("last_body"),
      (eb) => eb.selectFrom("messages as m").select("m.sender_id").whereRef("m.conversation_id", "=", "c.id").orderBy("m.created_at", "desc").limit(1).as("last_sender"),
      (eb) => eb.selectFrom("messages as m").select((e) => e.fn.countAll<string>().as("n")).whereRef("m.conversation_id", "=", "c.id")
        .where("m.sender_id", "!=", me).where("m.read_at", "is", null).as("unread"),
      (eb) => eb.selectFrom("listing_photos as p").select("p.id").whereRef("p.listing_id", "=", "c.listing_id").orderBy("p.position").limit(1).as("photo"),
    ])
    .where((eb) => eb.or([eb("c.a_id", "=", me), eb("c.b_id", "=", me)]))
    .orderBy("c.last_message_at", "desc").limit(100).execute();
  // hội thoại mới mở nhưng chưa ai gửi gì: không hiện (trừ khi mình đang mở nó — web tự giữ)
  return rows.filter((r) => r.last_body !== null).map(shape(me));
}

const shape = (me: string) => (r: {
  id: string; listing_id: string | null; last_message_at: Date; handle: string; display_name: string; banned_at: Date | null;
  listing_title: string | null; price_vnd: number | string | null; listing_status: string | null; listing_province: string | null;
  last_body: string | null; last_sender: string | null; unread: string | number | null; photo: string | null;
}) => ({
  id: r.id, lastMessageAt: r.last_message_at,
  other: { handle: r.handle, displayName: r.display_name, banned: !!r.banned_at },
  listing: r.listing_id && r.listing_title ? { id: r.listing_id, name: r.listing_title, priceVnd: r.price_vnd === null ? null : Number(r.price_vnd), status: r.listing_status, province: r.listing_province, photo: r.photo } : null,
  last: r.last_body ? { body: r.last_body, mine: r.last_sender === me } : null,
  unread: Number(r.unread ?? 0),
});

async function own(db: DB, me: string, id: string) {
  const c = await db.selectFrom("conversations").selectAll().where("id", "=", id).executeTakeFirst();
  if (!c || (c.a_id !== me && c.b_id !== me)) throw new MessageError(404, "Không tìm thấy hội thoại");
  return c;
}

/** Một hội thoại + tin nhắn (cũ → mới). Mở là đánh dấu đã đọc tin của người kia. after: chỉ lấy tin mới hơn (hỏi lại định kỳ). */
export async function openConversation(db: DB, me: string, id: string, opts: { before?: Date; after?: Date } = {}) {
  await own(db, me, id);
  const head = (await listConversationsById(db, me, id))!;
  let q = db.selectFrom("messages").select(["id", "sender_id", "body", "created_at", "read_at"]).where("conversation_id", "=", id);
  if (opts.before) q = q.where("created_at", "<", opts.before);
  if (opts.after) q = q.where("created_at", ">", opts.after);
  const rows = (await q.orderBy("created_at", "desc").limit(50).execute()).reverse();
  await db.updateTable("messages").set({ read_at: sql`now()` }).where("conversation_id", "=", id).where("sender_id", "!=", me).where("read_at", "is", null).execute();
  return {
    conversation: head,
    messages: rows.map((m) => ({ id: m.id, body: m.body, createdAt: m.created_at, mine: m.sender_id === me, read: !!m.read_at })),
    hasMore: !opts.after && rows.length === 50,
  };
}

async function listConversationsById(db: DB, me: string, id: string) {
  const row = await db.selectFrom("conversations as c")
    .innerJoin("users as u", (j) => j.on(sql<boolean>`u.id = case when c.a_id = ${me} then c.b_id else c.a_id end`))
    .leftJoin("listings as l", "l.id", "c.listing_id")
    .select([
      "c.id", "c.listing_id", "c.last_message_at", "u.handle", "u.display_name", "u.banned_at",
      "l.title as listing_title", "l.price_vnd", "l.status as listing_status", "l.province as listing_province",
      sql<null>`null`.as("last_body"), sql<null>`null`.as("last_sender"), sql<number>`0`.as("unread"),
      (eb) => eb.selectFrom("listing_photos as p").select("p.id").whereRef("p.listing_id", "=", "c.listing_id").orderBy("p.position").limit(1).as("photo"),
    ])
    .where("c.id", "=", id).executeTakeFirst();
  return row ? shape(me)(row) : null;
}

export async function sendMessage(db: DB, me: string, id: string, body: string) {
  const c = await own(db, me, id);
  const text = body.replace(/\r\n/g, "\n").trim();
  if (!text) throw new MessageError(400, "Tin nhắn trống");
  if (text.length > MAX_BODY) throw new MessageError(400, `Tin nhắn tối đa ${MAX_BODY} ký tự`);
  const other = c.a_id === me ? c.b_id : c.a_id;
  const banned = await db.selectFrom("users").select("banned_at").where("id", "=", other).executeTakeFirst();
  if (!banned || banned.banned_at) throw new MessageError(409, "Tài khoản này không nhận tin nhắn");
  const n = await db.selectFrom("messages").select((eb) => eb.fn.countAll<string>().as("n"))
    .where("sender_id", "=", me).where("created_at", ">", new Date(Date.now() - 3_600_000)).executeTakeFirstOrThrow();
  if (Number(n.n) >= MAX_PER_HOUR) throw new MessageError(429, "Bạn gửi quá nhiều tin nhắn, thử lại sau ít phút");
  const m = await db.insertInto("messages").values({ conversation_id: id, sender_id: me, body: text, read_at: null })
    .returning(["id", "body", "created_at"]).executeTakeFirstOrThrow();
  await db.updateTable("conversations").set({ last_message_at: m.created_at }).where("id", "=", id).execute();
  return { id: m.id, body: m.body, createdAt: m.created_at, mine: true, read: false };
}

/** Tổng tin chưa đọc (biểu tượng tin nhắn trên thanh trên) */
export async function unreadMessages(db: DB, me: string) {
  const r = await db.selectFrom("messages as m").innerJoin("conversations as c", "c.id", "m.conversation_id")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where((eb) => eb.or([eb("c.a_id", "=", me), eb("c.b_id", "=", me)]))
    .where("m.sender_id", "!=", me).where("m.read_at", "is", null).executeTakeFirstOrThrow();
  return Number(r.n);
}
