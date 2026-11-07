import { timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { createGoogleVerifier } from "../auth/google.js";
import {
  hashOtp, maskPhone, newOtpCode, normalizeVnPhone, OTP_MAX_ATTEMPTS, OTP_MAX_PER_HOUR, OTP_RESEND_MS, OTP_TTL_MS,
} from "../auth/phone.js";
import { clearSessionCookie, createSession, revokeSession, setSessionCookie } from "../auth/session.js";
import { findOrCreateUser, getProfile } from "../services/users.js";

const phoneBody = z.object({ phone: z.string().max(30) });
const verifyBody = z.object({ phone: z.string().max(30), code: z.string().regex(/^\d{6}$/, "Mã gồm 6 chữ số") });
const googleBody = z.object({ idToken: z.string().min(20).max(4096) });

const BAD_PHONE = "Số điện thoại chưa đúng. Nhập số di động Việt Nam, ví dụ 0912 345 678.";

export const authRoutes = (deps: AppDeps): FastifyPluginAsync => async (app) => {
  const { db } = deps;
  const google = deps.googleClientIds.length ? (deps.googleVerifier ?? createGoogleVerifier(deps.googleClientIds)) : null;

  app.get("/config", async () => ({
    phone: { enabled: true, devCodeShown: deps.devOtp },
    google: { clientId: deps.googleClientIds[0] ?? null },
  }));

  app.post("/otp/request", { config: { rateLimit: { max: deps.otpRequestsPerIpHour ?? 10, timeWindow: "1 hour" } } }, async (req, reply) => {
    const body = phoneBody.safeParse(req.body);
    const phone = body.success ? normalizeVnPhone(body.data.phone) : null;
    if (!phone) return reply.code(400).send({ error: "bad_phone", message: BAD_PHONE });

    const recent = await db.selectFrom("otp_codes").select("created_at").where("phone", "=", phone)
      .where("created_at", ">", new Date(Date.now() - 3600_000)).orderBy("created_at", "desc").execute();
    const last = recent[0] ? new Date(recent[0].created_at).getTime() : 0;
    const wait = Math.ceil((last + OTP_RESEND_MS - Date.now()) / 1000);
    if (wait > 0) return reply.code(429).send({ error: "too_soon", message: `Đợi ${wait} giây rồi gửi lại mã.`, retryIn: wait });
    if (recent.length >= OTP_MAX_PER_HOUR)
      return reply.code(429).send({ error: "too_many", message: "Số này đã nhận quá nhiều mã trong 1 giờ. Thử lại sau." });

    const code = newOtpCode();
    await db.insertInto("otp_codes").values({
      phone, code_hash: hashOtp(deps.pepper, phone, code), expires_at: new Date(Date.now() + OTP_TTL_MS), consumed_at: null, ip: req.ip,
    }).execute();
    await deps.sms.send(phone, `Ma dang nhap f2m: ${code}. Het han sau 5 phut. Khong chia se ma nay.`);
    return { ok: true, phone: maskPhone(phone), resendIn: OTP_RESEND_MS / 1000, ...(deps.devOtp ? { devCode: code } : {}) };
  });

  app.post("/otp/verify", { config: { rateLimit: { max: 30, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const body = verifyBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_code", message: "Nhập đủ 6 chữ số của mã." });
    const phone = normalizeVnPhone(body.data.phone);
    if (!phone) return reply.code(400).send({ error: "bad_phone", message: BAD_PHONE });

    const otp = await db.selectFrom("otp_codes").select(["id", "code_hash", "attempts"])
      .where("phone", "=", phone).where("consumed_at", "is", null).where("expires_at", ">", new Date())
      .orderBy("created_at", "desc").executeTakeFirst();
    if (!otp) return reply.code(400).send({ error: "expired", message: "Mã đã hết hạn hoặc chưa được gửi. Bấm Gửi lại mã." });
    if (otp.attempts >= OTP_MAX_ATTEMPTS)
      return reply.code(429).send({ error: "locked", message: "Nhập sai quá nhiều lần. Bấm Gửi lại mã để nhận mã mới." });

    const ok = timingSafeEqual(Buffer.from(otp.code_hash), Buffer.from(hashOtp(deps.pepper, phone, body.data.code)));
    if (!ok) {
      await db.updateTable("otp_codes").set((eb) => ({ attempts: eb("attempts", "+", 1) })).where("id", "=", otp.id).execute();
      const left = OTP_MAX_ATTEMPTS - otp.attempts - 1;
      return reply.code(400).send({ error: "wrong_code", message: left > 0 ? `Mã chưa đúng. Còn ${left} lần thử.` : "Mã chưa đúng. Bấm Gửi lại mã để nhận mã mới." });
    }
    await db.updateTable("otp_codes").set({ consumed_at: new Date() }).where("id", "=", otp.id).execute();

    const { userId, created } = await findOrCreateUser(db, "phone", phone, {
      displayName: `Người chơi ${phone.slice(-4)}`, handleHint: null, phone,
    });
    const token = await createSession(db, userId, req.headers["user-agent"]);
    setSessionCookie(reply, token, deps.cookieSecure);
    return { token, created, user: await getProfile(db, userId) };
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
    const { userId, created } = await findOrCreateUser(db, "google", profile.sub, {
      displayName: profile.name ?? "Người chơi", handleHint: profile.email?.split("@")[0] ?? profile.name, email: profile.email,
    });
    const token = await createSession(db, userId, req.headers["user-agent"]);
    setSessionCookie(reply, token, deps.cookieSecure);
    return { token, created, user: await getProfile(db, userId) };
  });

  app.post("/logout", async (req, reply) => {
    await revokeSession(db, req);
    clearSessionCookie(reply, deps.cookieSecure);
    return { ok: true };
  });
};
