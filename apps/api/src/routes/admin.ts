import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { userIdFromRequest } from "../auth/session.js";
import {
  AdminError, deleteListing, deleteUser, isAdmin, listAllListings, listUsers, logAction, moderateListing, recentLog, setBanned, setRole, stats,
} from "../services/admin.js";
import {
  checkTemplate, emailLog, isMailLang, isTemplateKey, type MailLang, later, logEmail, mailCtx, render, resetTemplate, sampleVars, saveTemplate, sendToUser, listTemplates, templateInput,
} from "../services/email.js";
import { BrandingError, brandingInput, deleteAsset, getBranding, isBrandKind, MAX_BRAND_BYTES, prepareAsset, saveAsset, saveBrandingText } from "../services/branding.js";
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
    if (e instanceof AdminError || e instanceof SettingsError || e instanceof BrandingError) return reply.code(e.status).send({ error: "admin", message: e.message });
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
      if (body.data.banned !== undefined) {
        await setBanned(db, me, id.data, body.data.banned, body.data.reason);
        if (body.data.banned) later(sendToUser(mailCtx(deps, req), "account_banned", id.data, { ly_do: body.data.reason?.trim() ?? "" }));
      }
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
    try {
      await moderateListing(db, me, id.data, body.data.removed, body.data.reason);
      if (body.data.removed) {
        const l = await db.selectFrom("listings").select(["seller_id", "title", "removed_reason"]).where("id", "=", id.data).executeTakeFirst();
        if (l) later(sendToUser(mailCtx(deps, req), "listing_removed", l.seller_id, { tin: l.title, ly_do: body.data.reason?.trim() ?? "" }));
      }
      return { ok: true };
    } catch (e) { return fail(reply, e); }
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
      await logEmail(db, { template: "smtp.test", to: body.data.to, userId: me.id, subject: "pcdex: thư thử cấu hình SMTP", status: "sent" });
      return { ok: true, messageId: info.messageId, accepted: info.accepted };
    } catch (e) {
      if (e instanceof SettingsError) return fail(reply, e);
      const msg = String((e as Error).message ?? e).slice(0, 300);
      await logAction(db, me, "smtp.test", body.data.to, { ok: false, error: msg });
      await logEmail(db, { template: "smtp.test", to: body.data.to, userId: me.id, subject: "pcdex: thư thử cấu hình SMTP", status: "failed", error: msg });
      return reply.code(502).send({ error: "smtp_failed", message: `Gửi thử thất bại: ${msg}` });
    }
  });

  // ---------- mẫu thư ----------
  /** ngôn ngữ của mẫu đang sửa: ?lang=vi|en (mặc định vi) */
  const langOf = (req: FastifyRequest): MailLang => { const l = (req.query as { lang?: string }).lang; return isMailLang(l) ? l : "vi"; };

  app.get("/admin/email/templates", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const smtp = await getSmtpPublic(db);
    return { templates: await listTemplates(db, langOf(req)), smtpReady: !!smtp?.enabled, lang: langOf(req) };
  });

  const keyOf = (req: FastifyRequest) => { const k = (req.params as { key: string }).key; return isTemplateKey(k) ? k : null; };

  app.put("/admin/email/templates/:key", async (req, reply) => {
    const me = await admin(req, reply);
    if (!me) return;
    const key = keyOf(req);
    if (!key) return reply.code(404).send({ error: "not_found", message: "Không có mẫu này" });
    const body = templateInput.safeParse(req.body);
    if (!body.success) return bad(reply, body.error.issues[0]?.message);
    const err = checkTemplate(key, body.data);
    if (err) return bad(reply, err);
    await saveTemplate(db, key, body.data, me.id, langOf(req));
    await logAction(db, me, "email.template", key, { enabled: body.data.enabled, lang: langOf(req) });
    return { templates: await listTemplates(db, langOf(req)) };
  });

  app.delete("/admin/email/templates/:key", async (req, reply) => {
    const me = await admin(req, reply);
    if (!me) return;
    const key = keyOf(req);
    if (!key) return reply.code(404).send({ error: "not_found", message: "Không có mẫu này" });
    await resetTemplate(db, key, langOf(req));
    await logAction(db, me, "email.template.reset", key, { lang: langOf(req) });
    return { templates: await listTemplates(db, langOf(req)) };
  });

  /** Xem trước bản đang soạn (chưa lưu) với dữ liệu mẫu */
  app.post("/admin/email/templates/:key/preview", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const key = keyOf(req);
    if (!key) return reply.code(404).send({ error: "not_found", message: "Không có mẫu này" });
    const body = templateInput.pick({ subject: true, body: true }).safeParse(req.body);
    if (!body.success) return bad(reply, body.error.issues[0]?.message);
    return { ...render(body.data, sampleVars(key, { link_app: `${mailCtx(deps, req).webUrl}${langOf(req) === "en" ? "/en" : ""}` })), warning: checkTemplate(key, body.data) };
  });

  /** Gửi thử bản đang soạn tới một địa chỉ, với dữ liệu mẫu */
  app.post("/admin/email/templates/:key/test", { config: { rateLimit: { max: 20, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const me = await admin(req, reply);
    if (!me) return;
    const key = keyOf(req);
    if (!key) return reply.code(404).send({ error: "not_found", message: "Không có mẫu này" });
    const body = templateInput.pick({ subject: true, body: true }).extend({ to: z.string().trim().email("Email nhận chưa đúng") }).safeParse(req.body);
    if (!body.success) return bad(reply, body.error.issues[0]?.message);
    const out = render(body.data, sampleVars(key, { link_app: `${mailCtx(deps, req).webUrl}${langOf(req) === "en" ? "/en" : ""}`, email: body.data.to }));
    const subject = `[Thử] ${out.subject}`;
    try {
      if (deps.sendMail) await deps.sendMail({ to: body.data.to, ...out, subject });
      else {
        const m = await mailer(db, deps.settingsKey);
        if (!m) return reply.code(409).send({ error: "smtp_off", message: "Chưa cấu hình SMTP hoặc đang tắt." });
        await m.send(body.data.to, subject, out.text, out.html);
      }
      await logEmail(db, { template: key, to: body.data.to, userId: me.id, subject, status: "sent" });
      return { ok: true };
    } catch (e) {
      if (e instanceof SettingsError) return fail(reply, e);
      const msg = String((e as Error).message ?? e).slice(0, 300);
      await logEmail(db, { template: key, to: body.data.to, userId: me.id, subject, status: "failed", error: msg });
      return reply.code(502).send({ error: "smtp_failed", message: `Gửi thử thất bại: ${msg}` });
    }
  });

  app.get("/admin/email/log", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const q = req.query as Record<string, string | undefined>;
    return { items: await emailLog(db, { ...page(q), template: q.template, status: q.status }) };
  });

  // ---------- thương hiệu ----------
  // Thân yêu cầu là chính tệp ảnh (Content-Type: image/svg+xml | image/png | image/webp)
  app.addContentTypeParser(/^image\/(svg\+xml|png|webp)$/, { parseAs: "buffer", bodyLimit: MAX_BRAND_BYTES + 1024 }, (_req, body, done) => done(null, body));

  app.get("/admin/branding", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    return getBranding(db);
  });

  app.put("/admin/branding", async (req, reply) => {
    const me = await admin(req, reply);
    if (!me) return;
    const body = brandingInput.safeParse(req.body);
    if (!body.success) return bad(reply, body.error.issues[0]?.message);
    await saveBrandingText(db, body.data, me.id);
    await logAction(db, me, "branding.text", null, body.data);
    return getBranding(db);
  });

  app.put("/admin/branding/:kind", { bodyLimit: MAX_BRAND_BYTES + 1024 }, async (req, reply) => {
    const me = await admin(req, reply);
    if (!me) return;
    const { kind } = req.params as { kind: string };
    if (!isBrandKind(kind)) return reply.code(404).send({ error: "not_found", message: "Không có mục này" });
    const mime = String(req.headers["content-type"] ?? "").split(";")[0]!.trim();
    if (!Buffer.isBuffer(req.body)) return bad(reply, "Gửi tệp SVG, PNG hoặc WebP.");
    try {
      const a = await prepareAsset(kind, mime, req.body);
      await saveAsset(db, kind, a, me.id);
      await logAction(db, me, "branding.asset", kind, { mime: a.mime, width: a.width, height: a.height, bytes: a.data.length });
      return getBranding(db);
    } catch (e) { return fail(reply, e); }
  });

  app.delete("/admin/branding/:kind", async (req, reply) => {
    const me = await admin(req, reply);
    if (!me) return;
    const { kind } = req.params as { kind: string };
    if (!isBrandKind(kind)) return reply.code(404).send({ error: "not_found", message: "Không có mục này" });
    await deleteAsset(db, kind);
    await logAction(db, me, "branding.reset", kind);
    return getBranding(db);
  });
};
