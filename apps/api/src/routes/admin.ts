import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { userIdFromRequest } from "../auth/session.js";
import {
  AdminError, deleteListing, deleteUser, isAdmin, listAllListings, listUsers, logAction, moderateListing, recentLog, setBanned, setRole, stats,
} from "../services/admin.js";
import { getSmtpPublic, mailer, saveSmtp, SettingsError, smtpInput } from "../services/settings.js";

const uuid = z.string().uuid();

/** /v1/admin/* — chỉ tài khoản có vai trò admin (và không bị khóa) */
export const adminRoutes = (deps: AppDeps): FastifyPluginAsync => async (app) => {
  const { db } = deps;
  const admin = async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = await userIdFromRequest(db, req);
    if (!uid) { reply.code(401).send({ error: "unauthorized", message: "Bạn cần đăng nhập." }); return null; }
    if (!(await isAdmin(db, uid))) { reply.code(403).send({ error: "forbidden", message: "Chỉ quản trị viên mới vào được." }); return null; }
    return db.selectFrom("users").select(["id", "handle"]).where("id", "=", uid).executeTakeFirstOrThrow();
  };
  const fail = (reply: FastifyReply, e: unknown) => {
    if (e instanceof AdminError || e instanceof SettingsError) return reply.code(e.status).send({ error: "admin", message: e.message });
    throw e;
  };
  const bad = (reply: FastifyReply, msg = "Dữ liệu chưa đúng") => reply.code(400).send({ error: "bad_request", message: msg });
  const page = (q: Record<string, string | undefined>) => ({ limit: Math.min(Number(q.limit) || 50, 200), offset: Math.max(Number(q.offset) || 0, 0) });
  const idOf = (req: FastifyRequest) => uuid.safeParse((req.params as { id: string }).id);

  app.get("/admin/stats", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    return { stats: await stats(db), log: await recentLog(db, 30) };
  });

  // ---------- người dùng ----------
  app.get("/admin/users", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const q = req.query as Record<string, string | undefined>;
    const filter = q.filter === "banned" || q.filter === "admin" ? q.filter : "all";
    return { items: await listUsers(db, { q: q.q, filter, ...page(q) }) };
  });

  const userPatch = z.object({ banned: z.boolean().optional(), reason: z.string().max(200).optional(), role: z.enum(["user", "admin"]).optional() });
  app.patch("/admin/users/:id", async (req, reply) => {
    const me = await admin(req, reply);
    if (!me) return;
    const id = idOf(req);
    const body = userPatch.safeParse(req.body);
    if (!id.success || !body.success) return bad(reply);
    try {
      if (body.data.banned !== undefined) await setBanned(db, me, id.data, body.data.banned, body.data.reason);
      if (body.data.role) await setRole(db, me, id.data, body.data.role);
      return { ok: true };
    } catch (e) { return fail(reply, e); }
  });

  app.delete("/admin/users/:id", async (req, reply) => {
    const me = await admin(req, reply);
    if (!me) return;
    const id = idOf(req);
    if (!id.success) return bad(reply);
    try { await deleteUser(db, me, id.data); return { ok: true }; } catch (e) { return fail(reply, e); }
  });

  // ---------- tin rao ----------
  app.get("/admin/listings", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const q = req.query as Record<string, string | undefined>;
    return { items: await listAllListings(db, { q: q.q, status: q.status, ...page(q) }) };
  });

  const listingPatch = z.object({ removed: z.boolean(), reason: z.string().max(200).optional() });
  app.patch("/admin/listings/:id", async (req, reply) => {
    const me = await admin(req, reply);
    if (!me) return;
    const id = idOf(req);
    const body = listingPatch.safeParse(req.body);
    if (!id.success || !body.success) return bad(reply);
    try { await moderateListing(db, me, id.data, body.data.removed, body.data.reason); return { ok: true }; } catch (e) { return fail(reply, e); }
  });

  app.delete("/admin/listings/:id", async (req, reply) => {
    const me = await admin(req, reply);
    if (!me) return;
    const id = idOf(req);
    if (!id.success) return bad(reply);
    try { await deleteListing(db, me, id.data); return { ok: true }; } catch (e) { return fail(reply, e); }
  });

  // ---------- email (SMTP) ----------
  app.get("/admin/settings/smtp", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    return { smtp: await getSmtpPublic(db), keyReady: !!deps.settingsKey };
  });

  app.put("/admin/settings/smtp", async (req, reply) => {
    const me = await admin(req, reply);
    if (!me) return;
    const body = smtpInput.safeParse(req.body);
    if (!body.success) return bad(reply, body.error.issues[0]?.message);
    try {
      const smtp = await saveSmtp(db, deps.settingsKey, body.data, me.id);
      const pw = body.data.password ? "đổi" : body.data.password === null ? "xóa" : "giữ";
      await logAction(db, me, "smtp.update", body.data.host, {
        port: body.data.port, security: body.data.security, user: body.data.user, from: body.data.fromEmail, enabled: body.data.enabled, password: pw,
      });
      return { smtp };
    } catch (e) { return fail(reply, e); }
  });

  app.post("/admin/settings/smtp/test", { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const me = await admin(req, reply);
    if (!me) return;
    const body = z.object({ to: z.string().trim().email("Email nhận chưa đúng") }).safeParse(req.body);
    if (!body.success) return bad(reply, body.error.issues[0]?.message);
    try {
      const m = await mailer(db, deps.settingsKey);
      if (!m) return reply.code(409).send({ error: "smtp_off", message: "Chưa cấu hình SMTP hoặc đang tắt." });
      const text = [
        "Xin chào,", "",
        `Đây là thư thử từ trang quản trị pcdex (người gửi: @${me.handle}). Nhận được thư này nghĩa là cấu hình SMTP đã chạy.`, "",
        "pcdex — https://pcdex.app",
      ].join("\n");
      const info = await m.send(body.data.to, "pcdex: thư thử cấu hình SMTP", text);
      await logAction(db, me, "smtp.test", body.data.to, { ok: true });
      return { ok: true, messageId: info.messageId, accepted: info.accepted };
    } catch (e) {
      if (e instanceof SettingsError) return fail(reply, e);
      const msg = String((e as Error).message ?? e).slice(0, 300);
      await logAction(db, me, "smtp.test", body.data.to, { ok: false, error: msg });
      return reply.code(502).send({ error: "smtp_failed", message: `Gửi thử thất bại: ${msg}` });
    }
  });
};
