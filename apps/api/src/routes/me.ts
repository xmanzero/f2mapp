import {
  evaluate, machineInputSchema, machineSpecSchema, ramFindings, resolveMachine, SCALE_VERSION, specToInput, UnknownPartError,
} from "@f2m/shared";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { reqLang } from "../i18n.js";
import { clearSessionCookie, cookieSecureFor, revokeOtherSessions, userIdFromRequest } from "../auth/session.js";
import { passwordField } from "./auth.js";
import {
  deleteMachine, deleteStoredPart, leaderboard, publicMachine, loadMachines, loadPrimaryMachine, MachineError, saveSpec, savePrimaryMachine, setPrimary,
} from "../services/machines.js";
import { clientIp, deviceOf, issueToken, later, mailCtx, recentTokens, sendToUser } from "../services/email.js";
import { AuthError, changePassword, getProfile, HANDLE_RE } from "../services/users.js";

const patchBody = z.object({
  displayName: z.string().trim().min(2, "Tên hiển thị từ 2 ký tự").max(40).optional(),
  handle: z.string().trim().toLowerCase().regex(HANDLE_RE, "Tên tài khoản 3–20 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới").optional(),
  province: z.string().trim().max(40).nullable().optional(),
  marketRegion: z.string().trim().min(1).max(40).nullable().optional(),
  /** ngôn ngữ giao diện và email */
  locale: z.enum(["vi", "en"]).optional(),
});

export const meRoutes = (deps: AppDeps): FastifyPluginAsync => async (app) => {
  const { db } = deps;
  const requireUser = async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = await userIdFromRequest(db, req);
    if (!uid) reply.code(401).send({ error: "unauthorized", message: "Bạn cần đăng nhập." });
    return uid;
  };
  const publicProfile = (uid: string) => getProfile(db, uid);

  app.get("/me", async (req, reply) => {
    const uid = await requireUser(req, reply);
    if (!uid) return;
    return { user: await publicProfile(uid), machine: await loadPrimaryMachine(db, uid) };
  });

  app.patch("/me", async (req, reply) => {
    const uid = await requireUser(req, reply);
    if (!uid) return;
    const body = patchBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", message: body.error.issues[0]?.message ?? "Dữ liệu chưa đúng" });
    const { displayName, handle, province, marketRegion, locale } = body.data;
    if (handle) {
      const taken = await db.selectFrom("users").select("id").where("handle", "=", handle).where("id", "!=", uid).executeTakeFirst();
      if (taken) return reply.code(409).send({ error: "handle_taken", message: `Tên tài khoản "${handle}" đã có người dùng.` });
    }
    const set = {
      ...(displayName !== undefined && { display_name: displayName }),
      ...(handle !== undefined && { handle }),
      ...(province !== undefined && { province: province || null }),
      ...(marketRegion !== undefined && { market_region: marketRegion }),
      ...(locale !== undefined && { locale }),
    };
    if (Object.keys(set).length) await db.updateTable("users").set(set).where("id", "=", uid).execute();
    return { user: await publicProfile(uid) };
  });

  /**
   * Xóa tài khoản (người dùng tự xóa): mất hết máy, linh kiện, tin rao, ảnh, phiên đăng nhập, liên kết Google.
   * Xác nhận bằng cách gõ lại tên tài khoản. Không hoàn tác được.
   */
  app.delete("/me", { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const uid = await requireUser(req, reply);
    if (!uid) return;
    const body = z.object({ confirm: z.string().trim().toLowerCase() }).safeParse(req.body);
    const me = await db.selectFrom("users").select("handle").where("id", "=", uid).executeTakeFirst();
    if (!me) return reply.code(404).send({ error: "not_found", message: "Không tìm thấy tài khoản" });
    if (!body.success || body.data.confirm.replace(/^@/, "") !== me.handle)
      return reply.code(400).send({ error: "confirm", message: `Gõ đúng tên tài khoản @${me.handle} để xác nhận xóa.` });
    await db.deleteFrom("users").where("id", "=", uid).execute(); // các bảng con xóa theo (on delete cascade)
    clearSessionCookie(reply, cookieSecureFor(req, deps.cookieSecure));
    return { ok: true };
  });

  const passwordBody = z.object({ currentPassword: z.string().max(128).optional(), newPassword: passwordField });
  app.post("/me/password", { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const uid = await requireUser(req, reply);
    if (!uid) return;
    const body = passwordBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", message: body.error.issues[0]?.message ?? "Dữ liệu chưa đúng" });
    try {
      await changePassword(db, uid, body.data.currentPassword, body.data.newPassword);
    } catch (e) {
      if (e instanceof AuthError) return reply.code(400).send({ error: e.code, message: e.message });
      throw e;
    }
    await revokeOtherSessions(db, req, uid);
    later(sendToUser(mailCtx(deps, req), "password_changed", uid, { ip: clientIp(req), thiet_bi: deviceOf(req.headers["user-agent"]) }));
    return { ok: true, user: await publicProfile(uid) };
  });

  /** Gửi lại thư xác minh email: cách nhau 60 giây, tối đa 5 thư / giờ */
  app.post("/me/verify-email", { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const uid = await requireUser(req, reply);
    if (!uid) return;
    const u = await db.selectFrom("users").select(["email", "email_verified_at"]).where("id", "=", uid).executeTakeFirstOrThrow();
    if (!u.email) return reply.code(400).send({ error: "no_email", message: "Tài khoản chưa có email." });
    if (u.email_verified_at) return reply.code(409).send({ error: "verified", message: "Email đã được xác minh." });
    const recent = await recentTokens(db, uid, "verify", 3600_000);
    if (recent.last && Date.now() - recent.last.getTime() < 60_000)
      return reply.code(429).send({ error: "too_soon", message: `Thư có link xác minh vừa được gửi tới ${u.email} (kể cả thư chào mừng khi đăng ký). Chờ 1 phút rồi gửi lại nếu chưa thấy.`, retryIn: 60 });
    if (recent.count >= 5) return reply.code(429).send({ error: "too_many", message: "Đã gửi 5 thư trong 1 giờ. Thử lại sau." });
    const mail = mailCtx(deps, req);
    const t = await issueToken(db, uid, "verify", u.email);
    const status = await sendToUser(mail, "verify_email", uid, { link: `/xac-minh-email?t=${t}` });
    if (status !== "sent") return reply.code(503).send({ error: "mail_off", message: "Chưa gửi được thư lúc này. Thử lại sau." });
    return { ok: true, email: u.email };
  });

  // ---------- máy chi tiết (tối đa 2) ----------
  const machineBody = z.object({ name: z.string().trim().min(1).max(40).optional(), spec: machineSpecSchema });
  const idParam = z.object({ id: z.string().uuid() });
  const machinesReply = async (uid: string) => ({ scaleVersion: SCALE_VERSION, machines: await loadMachines(db, uid) });
  const machineFail = (reply: FastifyReply, e: unknown) => {
    if (e instanceof MachineError) return reply.code(e.status).send({ error: "machine", message: e.message });
    if (e instanceof UnknownPartError) return reply.code(400).send({ error: "unknown_part", message: e.message });
    throw e;
  };
  const parseSpec = (req: FastifyRequest, reply: FastifyReply) => {
    const body = machineBody.safeParse(req.body);
    if (!body.success) { reply.code(400).send({ error: "bad_request", message: body.error.issues[0]?.message ?? "Cấu hình chưa đúng", issues: body.error.issues }); return null; }
    // RAM không lắp được vào máy này thì chặn ngay
    const bad = ramFindings(body.data.spec, reqLang(req)).filter((f) => f.severity === "critical");
    if (bad.length) { reply.code(400).send({ error: "ram_incompatible", message: bad[0]!.message }); return null; }
    try { resolveMachine(specToInput(body.data.spec)); } catch (e) { machineFail(reply, e); return null; }
    return body.data;
  };

  app.get("/me/machines", async (req, reply) => {
    const uid = await requireUser(req, reply);
    if (!uid) return;
    return machinesReply(uid);
  });
  app.post("/me/machines", async (req, reply) => {
    const uid = await requireUser(req, reply);
    if (!uid) return;
    const body = parseSpec(req, reply);
    if (!body) return;
    try { await saveSpec(db, uid, null, body.spec, body.name); } catch (e) { return machineFail(reply, e); }
    return reply.code(201).send(await machinesReply(uid));
  });
  app.put("/me/machines/:id", async (req, reply) => {
    const uid = await requireUser(req, reply);
    if (!uid) return;
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found", message: "Không tìm thấy máy" });
    const body = parseSpec(req, reply);
    if (!body) return;
    try { await saveSpec(db, uid, p.data.id, body.spec, body.name); } catch (e) { return machineFail(reply, e); }
    return machinesReply(uid);
  });
  app.post("/me/machines/:id/primary", async (req, reply) => {
    const uid = await requireUser(req, reply);
    if (!uid) return;
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found", message: "Không tìm thấy máy" });
    try { await setPrimary(db, uid, p.data.id); } catch (e) { return machineFail(reply, e); }
    return machinesReply(uid);
  });
  app.delete("/me/machines/:id", async (req, reply) => {
    const uid = await requireUser(req, reply);
    if (!uid) return;
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found", message: "Không tìm thấy máy" });
    try { await deleteMachine(db, uid, p.data.id); } catch (e) { return machineFail(reply, e); }
    return machinesReply(uid);
  });

  app.delete("/me/parts/:id", async (req, reply) => {
    const uid = await requireUser(req, reply);
    if (!uid) return;
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found", message: "Không tìm thấy linh kiện" });
    try { await deleteStoredPart(db, uid, p.data.id); } catch (e) { return machineFail(reply, e); }
    return { ok: true };
  });

  app.get("/me/machine", async (req, reply) => {
    const uid = await requireUser(req, reply);
    if (!uid) return;
    return { machine: await loadPrimaryMachine(db, uid) };
  });

  app.put("/me/machine", async (req, reply) => {
    const uid = await requireUser(req, reply);
    if (!uid) return;
    const body = machineInputSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", message: "Cấu hình không hợp lệ", issues: body.error.issues });
    try {
      const cfg = resolveMachine(body.data);
      await savePrimaryMachine(db, uid, cfg);
      return { machine: body.data, scaleVersion: SCALE_VERSION, ...evaluate(cfg) };
    } catch (e) {
      if (e instanceof UnknownPartError) return reply.code(400).send({ error: "unknown_part", message: e.message });
      throw e;
    }
  });

  app.get("/leaderboard", async (req) => {
    const limit = Math.min(Number((req.query as { limit?: string }).limit) || 100, 200);
    const uid = await userIdFromRequest(db, req);
    return { scaleVersion: SCALE_VERSION, me: uid, items: await leaderboard(db, limit) };
  });

  // chi tiết máy chính của một người trên bảng xếp hạng (ai cũng xem được)
  app.get("/leaderboard/:userId", async (req, reply) => {
    const { userId } = req.params as { userId: string };
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return reply.code(404).send({ error: "not_found", message: "Không tìm thấy máy" });
    const m = await publicMachine(db, userId);
    if (!m) return reply.code(404).send({ error: "not_found", message: "Không tìm thấy máy" });
    return { scaleVersion: SCALE_VERSION, ...m };
  });
};
