import { randomInt } from "node:crypto";
import type { DB } from "../db.js";

export const HANDLE_RE = /^[a-z0-9._]{3,20}$/;

/** Tạo handle từ gợi ý (phần trước @ của email…), bỏ dấu, thêm số nếu trùng */
async function uniqueHandle(db: DB, hint: string | null): Promise<string> {
  let base = (hint ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d")
    .toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 14);
  if (base.length < 3) base = "may";
  for (let i = 0; i < 20; i++) {
    const h = i === 0 && base !== "may" ? base : `${base}${randomInt(1000, 99999)}`;
    const taken = await db.selectFrom("users").select("id").where("handle", "=", h).executeTakeFirst();
    if (!taken) return h;
  }
  throw new Error("Không tạo được handle");
}

/**
 * Tìm người dùng theo định danh (số điện thoại / Google); chưa có thì tạo mới.
 * Trả về { userId, created }.
 */
export async function findOrCreateUser(
  db: DB,
  provider: "phone" | "google",
  subject: string,
  profile: { displayName: string; handleHint: string | null; phone?: string; email?: string | null },
) {
  const found = await db.selectFrom("user_identities").select("user_id")
    .where("provider", "=", provider).where("subject", "=", subject).executeTakeFirst();
  if (found) return { userId: found.user_id, created: false };

  return db.transaction().execute(async (tx) => {
    // email đã gắn với tài khoản khác (đăng nhập bằng cách khác trước đó) thì không tự gộp — để người dùng gắn trong trang tài khoản
    const email = profile.email && !(await tx.selectFrom("users").select("id").where("email", "=", profile.email).executeTakeFirst())
      ? profile.email : null;
    const user = await tx.insertInto("users").values({
      handle: await uniqueHandle(tx as unknown as DB, profile.handleHint),
      display_name: profile.displayName.slice(0, 40),
      phone: profile.phone ?? null,
      email,
      province: null,
    }).returning("id").executeTakeFirstOrThrow();
    await tx.insertInto("user_identities").values({ provider, subject, user_id: user.id }).execute();
    return { userId: user.id, created: true };
  });
}

export async function getProfile(db: DB, userId: string) {
  const u = await db.selectFrom("users").select(["id", "handle", "display_name", "phone", "email", "province"])
    .where("id", "=", userId).executeTakeFirst();
  if (!u) return null;
  const ids = await db.selectFrom("user_identities").select("provider").where("user_id", "=", userId).execute();
  return {
    id: u.id, handle: u.handle, displayName: u.display_name, province: u.province, email: u.email,
    phone: u.phone, providers: ids.map((i) => i.provider),
  };
}
