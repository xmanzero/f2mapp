import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { sql } from "kysely";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { createGoogleVerifier } from "../auth/google.js";
import { hashPassword, PASSWORD_MAX, PASSWORD_MIN } from "../auth/password.js";
import { clearSessionCookie, cookieSecureFor, createSession, revokeSession, setSessionCookie } from "../auth/session.js";
import { clientIp, consumeToken, deviceOf, issueToken, later, mailCtx, noteDevice, nowVn, recentTokens, sendToUser } from "../services/email.js";
import { AuthError, getProfile, loginWithGoogle, loginWithPassword, normalizeEmail, registerWithPassword } from "../services/users.js";

export const emailField = z.string().trim().max(254).email("Email chưa đúng định dạng, ví dụ ten@gmail.com");
export const passwordField = z.string()
  .min(PASSWORD_MIN, `Mật khẩu từ ${PASSWORD_MIN} ký tự`).max(PASSWORD_MAX, `Mật khẩu tối đa ${PASSWORD_MAX} ký tự`);

const registerBody = z.object({
  email: emailField,
  password: passwordField,
  displayName: z.string().trim().min(2, "Tên hiển thị từ 2 ký tự").max(40, "Tên hiển thị tối đa 40 ký tự"),
}).refine((b) => b.password.toLowerCase() !== b.email.toLowerCase(), { message: "Mật khẩu không được trùng email", path: ["password"] });
const loginBody = z.object({ email: z.string().trim().max(254), password: z.string().max(PASSWORD_MAX) });
const googleBody = z.object({ idToken: z.string().min(20).max(4096) });

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Dữ liệu chưa đúng";

export const authRoutes = (deps: AppDeps): FastifyPluginAsync => async (app) => {
  const { db } = deps;
  const google = deps.googleClientIds.length ? (deps.googleVerifier ?? createGoogleVerifier(deps.googleClientIds)) : null;

  /** how: cách vào — đăng ký mật khẩu, đăng nhập mật khẩu, Google (tạo mới hay không xem `created`), đặt lại mật khẩu */
  const signIn = async (req: FastifyRequest, reply: FastifyReply, userId: string, created: boolean, how: "password" | "google" | "reset" = "password") => {
    const ban = await db.selectFrom("users").select(["banned_at", "ban_reason", "email"]).where("id", "=", userId).executeTakeFirst();
    if (ban?.banned_at)
      return reply.code(403).send({ error: "banned", message: `Tài khoản đã bị khóa${ban.ban_reason ? `: ${ban.ban_reason}` : ""}. Liên hệ lienhe@pcdex.app nếu cần.` });
    const token = await createSession(db, userId, req.headers["user-agent"]);
    setSessionCookie(reply, token, cookieSecureFor(req, deps.cookieSecure));

    // thư tự động (gửi nền, không chặn đăng nhập)
    const mail = mailCtx(deps, req);
    const ip = clientIp(req);
    const { device, isNew } = await noteDevice(db, userId, req.headers["user-agent"], ip);
    if (created && how === "password" && ban?.email) {
      const t = await issueToken(db, userId, "verify", ban.email);
      later(sendToUser(mail, "welcome", userId, { link_xac_minh: `${mail.webUrl}/xac-minh-email?t=${t}` }));
    } else if (created) later(sendToUser(mail, "welcome", userId, { link_xac_minh: "" }));
    else if (isNew && how !== "reset") later(sendToUser(mail, "new_login", userId, { thoi_gian: nowVn(), ip, thiet_bi: device }));

    return reply.code(created ? 201 : 200).send({ token, created, user: await getProfile(db, userId) });
  };
  const authFail = (reply: FastifyReply, e: unknown) => {
    if (!(e instanceof AuthError)) throw e;
    const status = e.code === "locked" ? 429 : e.code === "bad_credentials" ? 401 : 409;
    return reply.code(status).send({ error: e.code, message: e.message, retryIn: e.retryIn });
  };

  app.get("/config", async () => ({
    password: { enabled: true, minLength: PASSWORD_MIN },
    google: { clientId: deps.googleClientIds[0] ?? null },
  }));

  app.post("/register", { config: { rateLimit: { max: deps.registerPerIpHour ?? 10, timeWindow: "1 hour" } } }, async (req, reply) => {
    const body = registerBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", message: firstIssue(body.error), field: body.error.issues[0]?.path[0] });
    try {
      return await signIn(req, reply, await registerWithPassword(db, body.data), true);
    } catch (e) {
      return authFail(reply, e);
    }
  });

  app.post("/login", { config: { rateLimit: { max: deps.loginPerIp10Min ?? 30, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const body = loginBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", message: "Nhập email và mật khẩu." });
    try {
      return await signIn(req, reply, await loginWithPassword(db, body.data.email, body.data.password), false);
    } catch (e) {
      return authFail(reply, e);
    }
  });

  app.post("/google", { config: { rateLimit: { max: 30, timeWindow: "10 minutes" } } }, async (req, reply) => {
    if (!google) return reply.code(503).send({ error: "google_off", message: "Đăng nhập Google chưa được bật trên máy chủ." });
    const body = googleBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_token", message: "Thiếu token Google." });
    let profile;
    try {
      profile = await google(body.data.idToken);
    } catch {
      return reply.code(401).send({ error: "bad_token", message: "Không xác thực được tài khoản Google. Thử đăng nhập lại." });
    }
    const { userId, created } = await loginWithGoogle(db, profile);
    return signIn(req, reply, userId, created, "google");
  });

  // ---------- quên mật khẩu / xác minh email ----------
  // Luôn trả cùng một câu, không để lộ email nào có tài khoản. Mỗi tài khoản: cách nhau 60 giây, tối đa 5 thư / giờ.
  app.post("/forgot", { config: { rateLimit: { max: deps.loginPerIp10Min ?? 5, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const body = z.object({ email: emailField }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", message: firstIssue(body.error) });
    const u = await db.selectFrom("users").select(["id", "email", "banned_at"]).where("email", "=", normalizeEmail(body.data.email)).executeTakeFirst();
    if (u?.email && !u.banned_at) {
      const recent = await recentTokens(db, u.id, "reset", 3600_000);
      if (recent.count < 5 && (!recent.last || Date.now() - recent.last.getTime() > 60_000)) {
        const mail = mailCtx(deps, req);
        const t = await issueToken(db, u.id, "reset", u.email);
        later(sendToUser(mail, "password_reset", u.id, { link: `${mail.webUrl}/dat-lai-mat-khau?t=${t}`, thoi_gian: nowVn(), ip: clientIp(req) }));
      }
    }
    return { ok: true, message: "Nếu email này có tài khoản pcdex, thư đặt lại mật khẩu đã được gửi. Kiểm tra hộp thư (cả mục Spam); link có hiệu lực 60 phút." };
  });

  app.post("/reset", { config: { rateLimit: { max: 20, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const body = z.object({ token: z.string().max(200), password: passwordField }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", message: firstIssue(body.error), field: body.error.issues[0]?.path[0] });
    const userId = await consumeToken(db, body.data.token, "reset");
    if (!userId) return reply.code(400).send({ error: "bad_token", message: "Link đặt lại mật khẩu đã hết hạn hoặc đã được dùng. Gửi yêu cầu mới." });
    // đặt lại qua email chứng minh người này nhận được thư: coi như đã xác minh email; mọi phiên cũ bị đăng xuất
    await db.updateTable("users").set({
      password_hash: await hashPassword(body.data.password), failed_logins: 0, locked_until: null,
      email_verified_at: sql`coalesce(email_verified_at, now())`,
    }).where("id", "=", userId).execute();
    await db.deleteFrom("sessions").where("user_id", "=", userId).execute();
    await db.deleteFrom("email_tokens").where("user_id", "=", userId).where("purpose", "=", "reset").where("used_at", "is", null).execute();
    later(sendToUser(mailCtx(deps, req), "password_changed", userId, { thoi_gian: nowVn(), ip: clientIp(req), thiet_bi: deviceOf(req.headers["user-agent"]) }));
    return signIn(req, reply, userId, false, "reset");
  });

  app.post("/verify-email", { config: { rateLimit: { max: 20, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const body = z.object({ token: z.string().max(200) }).safeParse(req.body);
    const userId = body.success ? await consumeToken(db, body.data.token, "verify") : null;
    if (!userId) return reply.code(400).send({ error: "bad_token", message: "Link xác minh đã hết hạn hoặc đã được dùng. Vào trang Tài khoản để gửi lại." });
    await db.updateTable("users").set({ email_verified_at: sql`coalesce(email_verified_at, now())` }).where("id", "=", userId).execute();
    const u = await db.selectFrom("users").select("email").where("id", "=", userId).executeTakeFirstOrThrow();
    return { ok: true, email: u.email };
  });

  app.post("/logout", async (req, reply) => {
    await revokeSession(db, req);
    clearSessionCookie(reply, cookieSecureFor(req, deps.cookieSecure));
    return { ok: true };
  });
};
