import { SCALE_VERSION } from "@f2m/shared";
import { sql } from "kysely";
import type { DB } from "../db.js";
import { listListings } from "./listings.js";
import { publicMachines } from "./machines.js";

export class SocialError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Người dùng theo tên (không phân biệt hoa thường), bỏ tài khoản bị khóa */
async function userByHandle(db: DB, handle: string) {
  if (!/^[a-z0-9._-]{2,40}$/i.test(handle)) return null;
  return db.selectFrom("users").select(["id", "handle", "display_name", "province", "created_at"])
    .where(sql<string>`lower(handle)`, "=", handle.toLowerCase()).where("banned_at", "is", null).executeTakeFirst();
}

/** Hạng của máy chính giữa các máy thành viên (bảng xếp hạng có thể trộn thêm máy mẫu khi còn ít người) */
async function rankOf(db: DB, power: number) {
  const r = await db.selectFrom("machines as m").innerJoin("users as u", "u.id", "m.owner_id")
    .innerJoin("machine_scores as s", (j) => j.onRef("s.machine_id", "=", "m.id").on("s.scale_version", "=", SCALE_VERSION))
    .select([sql<number>`count(*) filter (where s.power > ${power})`.as("above"), sql<number>`count(*)`.as("total")])
    .where("m.is_primary", "=", true).where("u.banned_at", "is", null).executeTakeFirstOrThrow();
  return { rank: Number(r.above) + 1, of: Number(r.total) };
}

/**
 * Hồ sơ công khai /u/<tên>: thông tin người dùng, các máy (điểm, linh kiện đã xác thực, số đo, lượt thích),
 * số người theo dõi / đang theo dõi, tin đang bán. viewerId: người đang xem (để biết đã theo dõi / đã thích chưa).
 */
export async function profile(db: DB, handle: string, viewerId: string | null) {
  const u = await userByHandle(db, handle);
  if (!u) return null;
  const machines = await publicMachines(db, u.id);
  const ids = machines.map((m) => m.id);
  const likes = ids.length ? await db.selectFrom("machine_likes").select(["machine_id", (eb) => eb.fn.countAll<string>().as("n")])
    .where("machine_id", "in", ids).groupBy("machine_id").execute() : [];
  const liked = ids.length && viewerId ? await db.selectFrom("machine_likes").select("machine_id")
    .where("user_id", "=", viewerId).where("machine_id", "in", ids).execute() : [];
  const count = async (col: "follower_id" | "followee_id") => Number((await db.selectFrom("follows")
    .select((eb) => eb.fn.countAll<string>().as("n")).where(col, "=", u.id).executeTakeFirstOrThrow()).n);
  const following = viewerId && viewerId !== u.id
    ? !!(await db.selectFrom("follows").select("followee_id").where("follower_id", "=", viewerId).where("followee_id", "=", u.id).executeTakeFirst())
    : false;
  const primary = machines.find((m) => m.isPrimary);
  return {
    user: { id: u.id, handle: u.handle, displayName: u.display_name, province: u.province, joinedAt: u.created_at },
    me: viewerId === u.id,
    following,
    followers: await count("followee_id"),
    followingCount: await count("follower_id"),
    rank: primary?.power != null ? await rankOf(db, primary.power) : null,
    machines: machines.map((m) => ({
      ...m,
      likes: Number(likes.find((l) => l.machine_id === m.id)?.n ?? 0),
      liked: liked.some((l) => l.machine_id === m.id),
    })),
    listings: await listListings(db, { sellerId: u.id, limit: 12, viewerId }),
  };
}

/** Danh sách người theo dõi / đang theo dõi (kèm điểm máy chính để hiện cạnh tên) */
export async function followList(db: DB, handle: string, which: "followers" | "following") {
  const u = await userByHandle(db, handle);
  if (!u) return null;
  const [mine, other] = which === "followers" ? ["followee_id", "follower_id"] as const : ["follower_id", "followee_id"] as const;
  return db.selectFrom("follows as f").innerJoin("users as u", "u.id", `f.${other}`)
    .leftJoin("machines as m", (j) => j.onRef("m.owner_id", "=", "u.id").on("m.is_primary", "=", true))
    .leftJoin("machine_scores as s", (j) => j.onRef("s.machine_id", "=", "m.id").on("s.scale_version", "=", SCALE_VERSION))
    .select(["u.handle", "u.display_name as displayName", "u.province", "s.power", "s.tier", "f.created_at as since"])
    .where(`f.${mine}`, "=", u.id).where("u.banned_at", "is", null).orderBy("f.created_at", "desc").limit(200).execute();
}

export async function setFollow(db: DB, viewerId: string, handle: string, on: boolean) {
  const u = await userByHandle(db, handle);
  if (!u) throw new SocialError(404, "Không tìm thấy người dùng");
  if (u.id === viewerId) throw new SocialError(400, "Không tự theo dõi chính mình được");
  if (on) await db.insertInto("follows").values({ follower_id: viewerId, followee_id: u.id }).onConflict((oc) => oc.doNothing()).execute();
  else await db.deleteFrom("follows").where("follower_id", "=", viewerId).where("followee_id", "=", u.id).execute();
  const n = await db.selectFrom("follows").select((eb) => eb.fn.countAll<string>().as("n")).where("followee_id", "=", u.id).executeTakeFirstOrThrow();
  return { following: on, followers: Number(n.n) };
}

export async function setLike(db: DB, viewerId: string, machineId: string, on: boolean) {
  const m = await db.selectFrom("machines as m").innerJoin("users as u", "u.id", "m.owner_id").select(["m.owner_id"])
    .where("m.id", "=", machineId).where("u.banned_at", "is", null).executeTakeFirst();
  if (!m) throw new SocialError(404, "Không tìm thấy máy");
  if (m.owner_id === viewerId) throw new SocialError(400, "Không thích máy của chính mình được");
  if (on) await db.insertInto("machine_likes").values({ user_id: viewerId, machine_id: machineId }).onConflict((oc) => oc.doNothing()).execute();
  else await db.deleteFrom("machine_likes").where("user_id", "=", viewerId).where("machine_id", "=", machineId).execute();
  const n = await db.selectFrom("machine_likes").select((eb) => eb.fn.countAll<string>().as("n")).where("machine_id", "=", machineId).executeTakeFirstOrThrow();
  return { liked: on, likes: Number(n.n) };
}

/** Người mình đang theo dõi (id) — để lọc bảng xếp hạng */
export async function followingIds(db: DB, viewerId: string) {
  return (await db.selectFrom("follows").select("followee_id").where("follower_id", "=", viewerId).execute()).map((r) => r.followee_id);
}
