import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { userIdFromRequest } from "../auth/session.js";
import { loadMachines } from "../services/machines.js";
import {
  createListing, createListingSchema, getListing, listListings, ListingError, myListings, sellableParts, updateListing, updateListingSchema,
} from "../services/listings.js";
import { addPhoto, deletePhoto, getPhoto, MAX_PHOTO_BYTES, orderPhotos } from "../services/photos.js";

const idParam = z.object({ id: z.string().uuid() });

export const listingRoutes = (deps: AppDeps): FastifyPluginAsync => async (app) => {
  const { db } = deps;
  const requireUser = async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = await userIdFromRequest(db, req);
    if (!uid) reply.code(401).send({ error: "unauthorized", message: "Bạn cần đăng nhập." });
    return uid;
  };
  const fail = (reply: FastifyReply, e: unknown) => {
    if (e instanceof ListingError) return reply.code(e.status).send({ error: "listing", message: e.message });
    throw e;
  };

  /** Tin đang bán (công khai) */
  app.get("/listings", async (req) => {
    const q = req.query as { kind?: string; q?: string; limit?: string };
    const viewer = await userIdFromRequest(db, req);
    return { items: await listListings(db, { kind: q.kind, q: q.q, limit: Number(q.limit) || undefined, viewerId: viewer }) };
  });

  app.get("/listings/:id", async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found", message: "Không tìm thấy tin" });
    const item = await getListing(db, p.data.id, await userIdFromRequest(db, req));
    if (!item) return reply.code(404).send({ error: "not_found", message: "Tin không còn hoặc đã bị ẩn" });
    return { item };
  });

  app.post("/listings", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (req, reply) => {
    const uid = await requireUser(req, reply);
    if (!uid) return;
    const body = createListingSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", message: body.error.issues[0]?.message ?? "Dữ liệu chưa đúng", field: body.error.issues[0]?.path[0] });
    try {
      const id = await createListing(db, uid, body.data);
      return reply.code(201).send({ item: await getListing(db, id, uid) });
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.patch("/listings/:id", async (req, reply) => {
    const uid = await requireUser(req, reply);
    if (!uid) return;
    const p = idParam.safeParse(req.params);
    const body = updateListingSchema.safeParse(req.body);
    if (!p.success) return reply.code(404).send({ error: "not_found", message: "Không tìm thấy tin" });
    if (!body.success) return reply.code(400).send({ error: "bad_request", message: body.error.issues[0]?.message ?? "Dữ liệu chưa đúng" });
    try {
      await updateListing(db, uid, p.data.id, body.data);
      return { item: await getListing(db, p.data.id, uid) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  // ---------- ảnh ----------
  // Thân yêu cầu là chính tệp ảnh (Content-Type: image/jpeg | image/png | image/webp), không cần multipart
  app.addContentTypeParser(/^image\/(jpeg|png|webp)$/, { parseAs: "buffer", bodyLimit: MAX_PHOTO_BYTES + 1024 }, (_req, body, done) => done(null, body));
  const photoParam = z.object({ id: z.string().uuid(), photoId: z.string().uuid() });

  app.post("/listings/:id/photos", { bodyLimit: MAX_PHOTO_BYTES + 1024, config: { rateLimit: { max: 60, timeWindow: "1 hour" } } }, async (req, reply) => {
    const uid = await requireUser(req, reply);
    if (!uid) return;
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found", message: "Không tìm thấy tin" });
    if (!Buffer.isBuffer(req.body)) return reply.code(415).send({ error: "listing", message: "Chỉ nhận ảnh JPEG, PNG hoặc WebP" });
    try {
      const photoId = await addPhoto(db, uid, p.data.id, req.body);
      return reply.code(201).send({ id: photoId, item: await getListing(db, p.data.id, uid) });
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.delete("/listings/:id/photos/:photoId", async (req, reply) => {
    const uid = await requireUser(req, reply);
    if (!uid) return;
    const p = photoParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found", message: "Không tìm thấy ảnh" });
    try {
      await deletePhoto(db, uid, p.data.id, p.data.photoId);
      return { item: await getListing(db, p.data.id, uid) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.put("/listings/:id/photos", async (req, reply) => {
    const uid = await requireUser(req, reply);
    if (!uid) return;
    const p = idParam.safeParse(req.params);
    const body = z.object({ order: z.array(z.string().uuid()).max(5) }).safeParse(req.body);
    if (!p.success) return reply.code(404).send({ error: "not_found", message: "Không tìm thấy tin" });
    if (!body.success) return reply.code(400).send({ error: "bad_request", message: "Danh sách ảnh không hợp lệ" });
    try {
      await orderPhotos(db, uid, p.data.id, body.data.order);
      return { item: await getListing(db, p.data.id, uid) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  /** Tệp ảnh. Id ảnh không bao giờ đổi nội dung nên cho trình duyệt lưu đệm lâu. */
  app.get("/photos/:photoId", async (req, reply) => {
    const p = z.object({ photoId: z.string().uuid() }).safeParse(req.params);
    const photo = p.success ? await getPhoto(db, p.data.photoId) : undefined;
    if (!photo) return reply.code(404).send({ error: "not_found", message: "Không tìm thấy ảnh" });
    return reply.header("Content-Type", photo.mime).header("Cache-Control", "public, max-age=31536000, immutable")
      .header("X-Content-Type-Options", "nosniff").send(Buffer.from(photo.data));
  });

  app.get("/me/listings", async (req, reply) => {
    const uid = await requireUser(req, reply);
    if (!uid) return;
    await loadMachines(db, uid); // tạo linh kiện còn thiếu của máy khai kiểu cũ
    return { items: await myListings(db, uid), parts: await sellableParts(db, uid) };
  });
};
