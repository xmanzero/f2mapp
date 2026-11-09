import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { SCALE_VERSION } from "@f2m/shared";
import type { AppDeps } from "../app.js";
import { userIdFromRequest } from "../auth/session.js";
import { feed, markAllRead, notifications, unreadCount } from "../services/activity.js";
import { createReport, listBlocks, REPORT_REASONS, SafetyError, setBlock } from "../services/safety.js";
import { followingIds, followList, profile, setFollow, setLike, SocialError } from "../services/social.js";
import { z } from "zod";

const reportBody = z.object({
  handle: z.string().max(40), conversationId: z.string().uuid().optional(), reason: z.enum(REPORT_REASONS),
  note: z.string().max(1000).optional(), block: z.boolean().optional(),
});

/** Cộng đồng: hồ sơ công khai, theo dõi, thích cấu hình máy (không có bình luận) */
export const socialRoutes = (deps: AppDeps): FastifyPluginAsync => async (app) => {
  const { db } = deps;
  const fail = (reply: FastifyReply, e: unknown) => {
    if (e instanceof SocialError || e instanceof SafetyError) return reply.code(e.status).send({ error: "social", message: e.message });
    throw e;
  };
  const handleOf = (p: unknown) => String((p as { handle: string }).handle ?? "");

  app.get("/users/:handle", async (req, reply) => {
    const p = await profile(db, handleOf(req.params), await userIdFromRequest(db, req));
    if (!p) return reply.code(404).send({ error: "not_found", message: "Không tìm thấy người dùng" });
    return { scaleVersion: SCALE_VERSION, ...p };
  });

  for (const which of ["followers", "following"] as const) {
    app.get(`/users/:handle/${which}`, async (req, reply) => {
      const items = await followList(db, handleOf(req.params), which);
      if (!items) return reply.code(404).send({ error: "not_found", message: "Không tìm thấy người dùng" });
      return { items };
    });
  }

  const follow = (on: boolean) => async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = await userIdFromRequest(db, req);
    if (!uid) return reply.code(401).send({ error: "unauthorized", message: "Bạn cần đăng nhập." });
    try { return await setFollow(db, uid, handleOf(req.params), on); } catch (e) { return fail(reply, e); }
  };
  const limit = { config: { rateLimit: { max: 120, timeWindow: "1 hour" } } };
  app.post("/users/:handle/follow", limit, follow(true));
  app.delete("/users/:handle/follow", limit, follow(false));

  const like = (on: boolean) => async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = await userIdFromRequest(db, req);
    if (!uid) return reply.code(401).send({ error: "unauthorized", message: "Bạn cần đăng nhập." });
    const id = String((req.params as { id: string }).id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply.code(404).send({ error: "not_found", message: "Không tìm thấy máy" });
    try { return await setLike(db, uid, id, on); } catch (e) { return fail(reply, e); }
  };
  app.post("/machines/:id/like", limit, like(true));
  app.delete("/machines/:id/like", limit, like(false));

  // ---------- bảng tin & thông báo ----------
  const me = async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = await userIdFromRequest(db, req);
    if (!uid) reply.code(401).send({ error: "unauthorized", message: "Bạn cần đăng nhập." });
    return uid;
  };
  app.get("/feed", async (req, reply) => {
    const uid = await me(req, reply); if (!uid) return;
    const before = (req.query as { before?: string }).before;
    const d = before ? new Date(before) : undefined;
    return feed(db, uid, d && !Number.isNaN(d.getTime()) ? d : undefined);
  });
  app.get("/notifications", async (req, reply) => {
    const uid = await me(req, reply); if (!uid) return;
    return notifications(db, uid);
  });
  app.get("/notifications/unread", async (req, reply) => {
    const uid = await me(req, reply); if (!uid) return;
    return { unread: await unreadCount(db, uid) };
  });
  app.post("/notifications/read", async (req, reply) => {
    const uid = await me(req, reply); if (!uid) return;
    await markAllRead(db, uid);
    return { unread: 0 };
  });

  // ---------- chặn / báo cáo ----------
  const block = (on: boolean) => async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = await me(req, reply); if (!uid) return;
    try { return await setBlock(db, uid, handleOf(req.params), on); } catch (e) { return fail(reply, e); }
  };
  app.post("/users/:handle/block", limit, block(true));
  app.delete("/users/:handle/block", limit, block(false));
  app.get("/me/blocks", async (req, reply) => {
    const uid = await me(req, reply); if (!uid) return;
    return { items: await listBlocks(db, uid) };
  });
  app.post("/reports", { config: { rateLimit: { max: 20, timeWindow: "1 day" } } }, async (req, reply) => {
    const uid = await me(req, reply); if (!uid) return;
    const b = reportBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "bad_request", message: "Dữ liệu chưa đúng" });
    try { return { id: await createReport(db, uid, b.data) }; } catch (e) { return fail(reply, e); }
  });

  /** id những người mình đang theo dõi (lọc bảng xếp hạng "Đang theo dõi") */
  app.get("/me/following", async (req, reply) => {
    const uid = await userIdFromRequest(db, req);
    if (!uid) return reply.code(401).send({ error: "unauthorized", message: "Bạn cần đăng nhập." });
    return { ids: await followingIds(db, uid) };
  });
};
