import { randomInt } from "node:crypto";
import type { DB } from "../db.js";
import { dummyHash, hashPassword, LOGIN_LOCK_MS, LOGIN_MAX_FAILS, verifyPassword } from "../auth/password.js";

export const HANDLE_RE = /^[a-z0-9._]{3,20}$/;
export const normalizeEmail = (e: string) => e.trim().toLowerCase();

/** Tạo handle từ gợi ý (phần trước @ của email…), bỏ dấu, thêm số nếu trùng */
async function uniqueHandle(db: DB, hint: string | null): Promise<string> {
  let base = (hint ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d")
    .toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 14);
  if (base.length < 3) base = "may";
  for (let i = 0; i < 20; i++) {
    const h = i === 0 && base !== "may" ? base : `${base}${randomInt(1000, 99999)}`;
    const taken = await db.selectFrom("users").select("id").where("handle", "=", h).executeTakeFirst();
    if (!taken) return h;
  }
  throw new Error("Không tạo được handle");
}

const byEmail = (db: DB, email: string) =>
  db.selectFrom("users").select(["id", "password_hash", "email_verified_at", "failed_logins", "locked_until"])
    .where("email", "=", normalizeEmail(email)).executeTakeFirst();

export class AuthError extends Error {
  constructor(public code: "email_taken" | "email_google" | "bad_credentials" | "locked", message: string, public retryIn?: number) {
    super(message);
  }
}

/** Đăng ký bằng email + mật khẩu */
export async function registerWithPassword(db: DB, input: { email: string; password: string; displayName: string }) {
  const email = normalizeEmail(input.email);
  const existing = await byEmail(db, email);
  if (existing)
    throw existing.password_hash
      ? new AuthError("email_taken", "Email này đã có tài khoản. Đăng nhập bằng email và mật khẩu.")
      : new AuthError("email_google", "Email này đã đăng ký bằng Google. Đăng nhập bằng Google, rồi đặt mật khẩu trong trang Tài khoản.");
  const user = await db.insertInto("users").values({
    handle: await uniqueHandle(db, email.split("@")[0]!),
    display_name: input.displayName.trim().slice(0, 40),
    email, phone: null, province: null,
    password_hash: await hashPassword(input.password),
    email_verified_at: null, locked_until: null,
  }).returning("id").executeTakeFirstOrThrow();
  return user.id;
}

/** Đăng nhập email + mật khẩu; sai 5 lần thì khóa 15 phút */
export async function loginWithPassword(db: DB, emailRaw: string, password: string) {
  const u = await byEmail(db, emailRaw);
  if (!u || !u.password_hash) {
    await verifyPassword(password, await dummyHash()); // thời gian như khi có tài khoản
    throw new AuthError("bad_credentials", "Email hoặc mật khẩu chưa đúng.");
  }
  if (u.locked_until && new Date(u.locked_until).getTime() > Date.now()) {
    const wait = Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / 60_000);
    throw new AuthError("locked", `Đăng nhập sai nhiều lần. Thử lại sau ${wait} phút.`, wait * 60);
  }
  if (!(await verifyPassword(password, u.password_hash))) {
    const fails = u.failed_logins + 1;
    const lock = fails >= LOGIN_MAX_FAILS;
    await db.updateTable("users").set({
      failed_logins: lock ? 0 : fails, locked_until: lock ? new Date(Date.now() + LOGIN_LOCK_MS) : null,
    }).where("id", "=", u.id).execute();
    throw lock
      ? new AuthError("locked", "Đăng nhập sai 5 lần. Tài khoản tạm khóa 15 phút.", LOGIN_LOCK_MS / 1000)
      : new AuthError("bad_credentials", "Email hoặc mật khẩu chưa đúng.");
  }
  if (u.failed_logins || u.locked_until) await db.updateTable("users").set({ failed_logins: 0, locked_until: null }).where("id", "=", u.id).execute();
  return u.id;
}

/**
 * Đăng nhập Google. Chưa có tài khoản thì tạo. Email trùng tài khoản mật khẩu thì gộp vào đó:
 * email đăng ký bằng mật khẩu chưa được xác minh, nên khi chủ thật của email (Google đã xác minh) đăng nhập,
 * mật khẩu cũ bị xóa và mọi phiên cũ bị đăng xuất — chặn việc ai đó đăng ký trước bằng email của người khác.
 */
export async function loginWithGoogle(db: DB, g: { sub: string; email: string | null; name: string | null }) {
  const linked = await db.selectFrom("user_identities").select("user_id")
    .where("provider", "=", "google").where("subject", "=", g.sub).executeTakeFirst();
  if (linked) return { userId: linked.user_id, created: false };

  return db.transaction().execute(async (tx) => {
    const t = tx as unknown as DB;
    const email = g.email ? normalizeEmail(g.email) : null;
    const existing = email ? await byEmail(t, email) : undefined;
    if (existing) {
      if (!existing.email_verified_at) {
        await t.updateTable("users").set({ password_hash: null, email_verified_at: new Date(), failed_logins: 0, locked_until: null })
          .where("id", "=", existing.id).execute();
        await t.deleteFrom("sessions").where("user_id", "=", existing.id).execute();
      }
      await t.insertInto("user_identities").values({ provider: "google", subject: g.sub, user_id: existing.id }).execute();
      return { userId: existing.id, created: false };
    }
    const user = await t.insertInto("users").values({
      handle: await uniqueHandle(t, email?.split("@")[0] ?? g.name),
      display_name: (g.name ?? "Người chơi").slice(0, 40),
      email, phone: null, province: null, password_hash: null,
      email_verified_at: email ? new Date() : null, locked_until: null,
    }).returning("id").executeTakeFirstOrThrow();
    await t.insertInto("user_identities").values({ provider: "google", subject: g.sub, user_id: user.id }).execute();
    return { userId: user.id, created: true };
  });
}

/** Đặt / đổi mật khẩu. Đã có mật khẩu thì phải nhập đúng mật khẩu hiện tại. */
export async function changePassword(db: DB, userId: string, current: string | undefined, next: string) {
  const u = await db.selectFrom("users").select(["password_hash", "email"]).where("id", "=", userId).executeTakeFirstOrThrow();
  if (!u.email) throw new AuthError("bad_credentials", "Tài khoản chưa có email nên chưa đặt được mật khẩu.");
  if (u.password_hash && !(current && (await verifyPassword(current, u.password_hash))))
    throw new AuthError("bad_credentials", "Mật khẩu hiện tại chưa đúng.");
  await db.updateTable("users").set({ password_hash: await hashPassword(next) }).where("id", "=", userId).execute();
}

export async function getProfile(db: DB, userId: string) {
  const u = await db.selectFrom("users").select(["id", "handle", "display_name", "email", "province", "market_region", "password_hash", "email_verified_at", "role"])
    .where("id", "=", userId).executeTakeFirst();
  if (!u) return null;
  const ids = await db.selectFrom("user_identities").select("provider").where("user_id", "=", userId).execute();
  // tỉnh của tin đăng gần nhất: gợi ý khu vực lọc chợ khi người dùng chưa chọn
  const last = await db.selectFrom("listings").select("province").where("seller_id", "=", userId).where("province", "is not", null)
    .orderBy("created_at", "desc").limit(1).executeTakeFirst();
  return {
    id: u.id, handle: u.handle, displayName: u.display_name, province: u.province, email: u.email, role: u.role,
    emailVerified: !!u.email_verified_at, hasPassword: !!u.password_hash,
    /** khu vực lọc chợ đã lưu: tên tỉnh, "all" = toàn quốc, null = chưa chọn */
    marketRegion: u.market_region, lastListingProvince: last?.province ?? null,
    providers: [...(u.password_hash ? ["password" as const] : []), ...ids.map((i) => i.provider)],
  };
}
