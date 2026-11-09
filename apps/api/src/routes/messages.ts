import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { userIdFromRequest } from "../auth/session.js";
import { isAdmin } from "../services/admin.js";
import {
  getMessageImage, listConversations, MAX_BODY, MAX_IMAGE_BYTES, MessageError, openConversation, sendImage, sendMessage, startConversation, unreadMessages,
} from "../services/messages.js";

const startBody = z.object({ listingId: z.string().uuid().optional(), handle: z.string().max(40).optional() })
  .refine((b) => !!b.listingId !== !!b.handle);
const sendBody = z.object({ body: z.string().min(1).max(MAX_BODY + 200) });
const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const dateOf = (s?: string) => { const d = s ? new Date(s) : undefined; return d && !Number.isNaN(d.getTime()) ? d : undefined; };

/** Tin nhắn giữa hai người (về một tin rao, hoặc nhắn trực tiếp từ hồ sơ). Chỉ người trong hội thoại mới đọc được. */
export const messageRoutes = (deps: AppDeps): FastifyPluginAsync => async (app) => {
  const { db } = deps;
  const me = async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = await userIdFromRequest(db, req);
    if (!uid) reply.code(401).send({ error: "unauthorized", message: "Bạn cần đăng nhập." });
    return uid;
  };
  const fail = (reply: FastifyReply, e: unknown) => {
    if (e instanceof MessageError) return reply.code(e.status).send({ error: "message", message: e.message });
    throw e;
  };

  app.post("/conversations", { config: { rateLimit: { max: 60, timeWindow: "1 hour" } } }, async (req, reply) => {
    const uid = await me(req, reply); if (!uid) return;
    const b = startBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "bad_request", message: "Dữ liệu chưa đúng" });
    try { return { id: await startConversation(db, uid, b.data) }; } catch (e) { return fail(reply, e); }
  });

  app.get("/conversations", async (req, reply) => {
    const uid = await me(req, reply); if (!uid) return;
    return { items: await listConversations(db, uid), unread: await unreadMessages(db, uid) };
  });

  app.get("/conversations/:id", async (req, reply) => {
    const uid = await me(req, reply); if (!uid) return;
    const id = (req.params as { id: string }).id;
    if (!isId(id)) return reply.code(404).send({ error: "not_found", message: "Không tìm thấy hội thoại" });
    const q = req.query as { before?: string; after?: string };
    try { return await openConversation(db, uid, id, { before: dateOf(q.before), after: dateOf(q.after) }); } catch (e) { return fail(reply, e); }
  });

  app.post("/conversations/:id/messages", { config: { rateLimit: { max: 200, timeWindow: "1 hour" } } }, async (req, reply) => {
    const uid = await me(req, reply); if (!uid) return;
    const id = (req.params as { id: string }).id;
    const b = sendBody.safeParse(req.body);
    if (!isId(id) || !b.success) return reply.code(400).send({ error: "bad_request", message: "Dữ liệu chưa đúng" });
    try { return { message: await sendMessage(db, uid, id, b.data.body) }; } catch (e) { return fail(reply, e); }
  });

  // ảnh: thân yêu cầu là chính tệp ảnh (trình duyệt đã thu nhỏ); máy chủ đổi sang WebP ≤ 1600 px, bỏ metadata
  app.addContentTypeParser(/^image\/(jpeg|png|webp)$/, { parseAs: "buffer", bodyLimit: MAX_IMAGE_BYTES }, (_req, body, done) => done(null, body));
  app.post("/conversations/:id/images", { bodyLimit: MAX_IMAGE_BYTES, config: { rateLimit: { max: 60, timeWindow: "1 hour" } } }, async (req, reply) => {
    const uid = await me(req, reply); if (!uid) return;
    const id = (req.params as { id: string }).id;
    if (!isId(id)) return reply.code(404).send({ error: "not_found", message: "Không tìm thấy hội thoại" });
    if (!Buffer.isBuffer(req.body)) return reply.code(415).send({ error: "message", message: "Chỉ nhận ảnh JPEG, PNG hoặc WebP" });
    try { return { message: await sendImage(db, uid, id, req.body) }; } catch (e) { return fail(reply, e); }
  });
  app.get("/messages/images/:id", async (req, reply) => {
    const uid = await me(req, reply); if (!uid) return;
    const id = (req.params as { id: string }).id;
    const data = isId(id) ? await getMessageImage(db, uid, await isAdmin(db, uid), id) : null;
    if (!data) return reply.code(404).send({ error: "not_found", message: "Không tìm thấy ảnh" });
    return reply.header("content-type", "image/webp").header("cache-control", "private, max-age=31536000, immutable").send(data);
  });

  app.get("/messages/unread", async (req, reply) => {
    const uid = await me(req, reply); if (!uid) return;
    return { unread: await unreadMessages(db, uid) };
  });
};
