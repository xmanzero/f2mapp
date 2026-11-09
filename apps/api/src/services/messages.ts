import { sql } from "kysely";
import sharp from "sharp";
import type { DB } from "../db.js";
import { sniff } from "./photos.js";
import { blockedEither, iBlocked } from "./safety.js";

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
  if (await blockedEither(db, me, other)) throw new MessageError(403, "Không gửi được tin nhắn cho người này");
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
      (eb) => eb.selectFrom("messages as m").select("m.image_id").whereRef("m.conversation_id", "=", "c.id").orderBy("m.created_at", "desc").limit(1).as("last_image"),
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
  last_body: string | null; last_sender: string | null; unread: string | number | null; photo: string | null; last_image?: string | null;
}) => ({
  id: r.id, lastMessageAt: r.last_message_at,
  other: { handle: r.handle, displayName: r.display_name, banned: !!r.banned_at },
  listing: r.listing_id && r.listing_title ? { id: r.listing_id, name: r.listing_title, priceVnd: r.price_vnd === null ? null : Number(r.price_vnd), status: r.listing_status, province: r.listing_province, photo: r.photo } : null,
  last: r.last_body !== null ? { body: r.last_body, mine: r.last_sender === me, image: !!r.last_image } : null,
  unread: Number(r.unread ?? 0),
});

async function own(db: DB, me: string, id: string) {
  const c = await db.selectFrom("conversations").selectAll().where("id", "=", id).executeTakeFirst();
  if (!c || (c.a_id !== me && c.b_id !== me)) throw new MessageError(404, "Không tìm thấy hội thoại");
  return c;
}

/** Một hội thoại + tin nhắn (cũ → mới). Mở là đánh dấu đã đọc tin của người kia. after: chỉ lấy tin mới hơn (hỏi lại định kỳ). */
export async function openConversation(db: DB, me: string, id: string, opts: { before?: Date; after?: Date } = {}) {
  const c = await own(db, me, id);
  const other = c.a_id === me ? c.b_id : c.a_id;
  const head = (await listConversationsById(db, me, id))!;
  let q = db.selectFrom("messages as m").leftJoin("message_images as i", "i.id", "m.image_id")
    .select(["m.id", "m.sender_id", "m.body", "m.created_at", "m.read_at", "i.id as image_id", "i.width", "i.height"]).where("m.conversation_id", "=", id);
  if (opts.before) q = q.where("m.created_at", "<", opts.before);
  if (opts.after) q = q.where("m.created_at", ">", opts.after);
  const rows = (await q.orderBy("m.created_at", "desc").limit(50).execute()).reverse();
  await db.updateTable("messages").set({ read_at: sql`now()` }).where("conversation_id", "=", id).where("sender_id", "!=", me).where("read_at", "is", null).execute();
  const blocked = await iBlocked(db, me, other);
  return {
    // blocked: mình đã chặn người kia (hiện nút Bỏ chặn); canSend: không ai chặn ai, người kia chưa bị khóa
    conversation: { ...head, blocked, canSend: !head.other.banned && !(await blockedEither(db, me, other)) },
    messages: rows.map((m) => ({
      id: m.id, body: m.body, createdAt: m.created_at, mine: m.sender_id === me, read: !!m.read_at,
      image: m.image_id ? { id: m.image_id, width: m.width!, height: m.height! } : null,
    })),
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

/** Gửi được không: người kia chưa bị khóa, không ai chặn ai, chưa vượt giới hạn tin / giờ */
async function checkSend(db: DB, me: string, c: { a_id: string; b_id: string }) {
  const other = c.a_id === me ? c.b_id : c.a_id;
  if (await blockedEither(db, me, other)) throw new MessageError(403, "Không gửi được tin nhắn cho người này");
  const banned = await db.selectFrom("users").select("banned_at").where("id", "=", other).executeTakeFirst();
  if (!banned || banned.banned_at) throw new MessageError(409, "Tài khoản này không nhận tin nhắn");
  const n = await db.selectFrom("messages").select((eb) => eb.fn.countAll<string>().as("n"))
    .where("sender_id", "=", me).where("created_at", ">", new Date(Date.now() - 3_600_000)).executeTakeFirstOrThrow();
  if (Number(n.n) >= MAX_PER_HOUR) throw new MessageError(429, "Bạn gửi quá nhiều tin nhắn, thử lại sau ít phút");
}

export async function sendMessage(db: DB, me: string, id: string, body: string) {
  const c = await own(db, me, id);
  const text = body.replace(/\r\n/g, "\n").trim();
  if (!text) throw new MessageError(400, "Tin nhắn trống");
  if (text.length > MAX_BODY) throw new MessageError(400, `Tin nhắn tối đa ${MAX_BODY} ký tự`);
  await checkSend(db, me, c);
  const m = await db.insertInto("messages").values({ conversation_id: id, sender_id: me, body: text, read_at: null })
    .returning(["id", "body", "created_at"]).executeTakeFirstOrThrow();
  await db.updateTable("conversations").set({ last_message_at: m.created_at }).where("id", "=", id).execute();
  return { id: m.id, body: m.body, createdAt: m.created_at, mine: true, read: false, image: null };
}

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Ảnh tin nhắn: xoay đúng chiều, thu về cạnh dài ≤ 1600 px, WebP chất lượng 75, bỏ metadata (vị trí GPS, máy chụp) */
export async function processMessageImage(input: Buffer) {
  const { data, info } = await sharp(input, { failOn: "error", limitInputPixels: 50_000_000 }).rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 75, effort: 4 }).toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Gửi một ảnh (tin chỉ có ảnh, chữ trống) */
export async function sendImage(db: DB, me: string, id: string, body: Buffer) {
  const c = await own(db, me, id);
  if (!sniff(body)) throw new MessageError(415, "Chỉ nhận ảnh JPEG, PNG hoặc WebP");
  await checkSend(db, me, c);
  let img: Awaited<ReturnType<typeof processMessageImage>>;
  try { img = await processMessageImage(body); } catch { throw new MessageError(415, "Không đọc được ảnh"); }
  return db.transaction().execute(async (tx) => {
    const i = await tx.insertInto("message_images").values({ conversation_id: id, uploader_id: me, data: img.data, width: img.width, height: img.height, size_bytes: img.data.length })
      .returning("id").executeTakeFirstOrThrow();
    const m = await tx.insertInto("messages").values({ conversation_id: id, sender_id: me, body: "", image_id: i.id, read_at: null })
      .returning(["id", "body", "created_at"]).executeTakeFirstOrThrow();
    await tx.updateTable("conversations").set({ last_message_at: m.created_at }).where("id", "=", id).execute();
    return { id: m.id, body: m.body, createdAt: m.created_at, mine: true, read: false, image: { id: i.id, width: img.width, height: img.height } };
  });
}

/** Ảnh tin nhắn: người trong hội thoại, hoặc quản trị viên khi hội thoại bị báo cáo */
export async function getMessageImage(db: DB, viewer: string, isAdmin: boolean, imageId: string) {
  const i = await db.selectFrom("message_images as i").innerJoin("conversations as c", "c.id", "i.conversation_id")
    .select(["i.data", "c.a_id", "c.b_id", "c.id as conversation_id"]).where("i.id", "=", imageId).executeTakeFirst();
  if (!i) return null;
  if (i.a_id === viewer || i.b_id === viewer) return i.data;
  if (isAdmin && (await db.selectFrom("reports").select("id").where("conversation_id", "=", i.conversation_id).executeTakeFirst())) return i.data;
  return null;
}

/** Tổng tin chưa đọc (biểu tượng tin nhắn trên thanh trên) */
export async function unreadMessages(db: DB, me: string) {
  const r = await db.selectFrom("messages as m").innerJoin("conversations as c", "c.id", "m.conversation_id")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where((eb) => eb.or([eb("c.a_id", "=", me), eb("c.b_id", "=", me)]))
    .where("m.sender_id", "!=", me).where("m.read_at", "is", null).executeTakeFirstOrThrow();
  return Number(r.n);
}
