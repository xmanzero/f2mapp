import type { FastifyPluginAsync } from "fastify";
import type { AppDeps } from "../app.js";
import { FAVICON_SIZES, getBranding, isBrandKind, loadAsset } from "../services/branding.js";

/** Thương hiệu công khai: web đọc khi dựng trang (logo, slogan, favicon) */
export const brandingRoutes = (deps: AppDeps): FastifyPluginAsync => async (app) => {
  const { db } = deps;

  app.get("/branding", async (_req, reply) => {
    reply.header("cache-control", "public, max-age=60");
    return getBranding(db);
  });

  app.get("/branding/asset/:kind", async (req, reply) => {
    const { kind } = req.params as { kind: string };
    const q = req.query as { s?: string; v?: string };
    if (!isBrandKind(kind)) return reply.code(404).send({ error: "not_found", message: "Không có ảnh này" });
    const want = Number(q.s);
    const size = FAVICON_SIZES.find((s) => s >= want) ?? 512;
    const a = await loadAsset(db, kind, q.s ? size : undefined);
    if (!a) return reply.code(404).send({ error: "not_found", message: "Chưa đặt ảnh này" });
    reply.header("content-type", a.mime).header("x-content-type-options", "nosniff")
      // địa chỉ có ?v= đổi khi ảnh đổi → cache lâu; không có thì cache ngắn
      .header("cache-control", q.v ? "public, max-age=31536000, immutable" : "public, max-age=300");
    // SVG mở trực tiếp cũng không chạy được gì
    if (a.mime === "image/svg+xml") reply.header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    return reply.send(a.data);
  });
};
