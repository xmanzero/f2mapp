import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { createGoogleVerifier } from "../auth/google.js";
import { PASSWORD_MAX, PASSWORD_MIN } from "../auth/password.js";
import { clearSessionCookie, createSession, revokeSession, setSessionCookie } from "../auth/session.js";
import { AuthError, getProfile, loginWithGoogle, loginWithPassword, registerWithPassword } from "../services/users.js";

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

  const signIn = async (req: FastifyRequest, reply: FastifyReply, userId: string, created: boolean) => {
    const token = await createSession(db, userId, req.headers["user-agent"]);
    setSessionCookie(reply, token, deps.cookieSecure);
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
    return signIn(req, reply, userId, created);
  });

  app.post("/logout", async (req, reply) => {
    await revokeSession(db, req);
    clearSessionCookie(reply, deps.cookieSecure);
    return { ok: true };
  });
};
