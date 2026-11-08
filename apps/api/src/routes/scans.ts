import { scanReportSchema } from "@f2m/shared";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { userIdFromRequest } from "../auth/session.js";
import { MachineError } from "../services/machines.js";
import { claimScan, createScan, getScan, prettyCode, qrMatrix } from "../services/scans.js";

const claimBody = z.object({
  machineId: z.string().uuid().nullable(),
  cpu: z.string().max(80).optional(),
  gpu: z.string().max(80).optional(),
  psuW: z.number().int().min(200).max(2000).optional(),
  name: z.string().max(40).optional(),
});

export const scanRoutes = (deps: AppDeps): FastifyPluginAsync => async (app) => {
  const { db } = deps;
  /** Địa chỉ web người dùng mở để gắn bản quét (QR trỏ tới đây) */
  const webBase = (req: FastifyRequest) => (deps.webUrl
    ?? `${req.headers["x-forwarded-proto"] ?? req.protocol}://${req.headers["x-forwarded-host"] ?? req.headers.host}`).replace(/\/+$/, "");

  /** Phần mềm f2m-scan gửi kết quả quét (không cần đăng nhập) → mã ngắn + QR */
  app.post("/scans", { bodyLimit: 64 * 1024, config: { rateLimit: { max: 30, timeWindow: "1 hour" } } }, async (req, reply) => {
    const body = scanReportSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", message: "Dữ liệu quét không hợp lệ", issues: body.error.issues.slice(0, 3) });
    const s = await createScan(db, body.data);
    const claimUrl = `${webBase(req)}/quet?ma=${s.code}`;
    return reply.code(201).send({ code: s.code, pretty: prettyCode(s.code), claimUrl, qr: qrMatrix(claimUrl), expiresAt: s.expiresAt, result: s.result });
  });

  app.get("/scans/:code", async (req, reply) => {
    const { code } = req.params as { code: string };
    const s = code.length <= 20 ? await getScan(db, code) : null;
    if (!s) return reply.code(404).send({ error: "not_found", message: "Không tìm thấy mã quét. Kiểm tra lại mã trên phần mềm." });
    return { ...s, pretty: prettyCode(s.code) };
  });

  app.post("/scans/:code/claim", { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } }, async (req, reply) => {
    const uid = await userIdFromRequest(db, req);
    if (!uid) return reply.code(401).send({ error: "unauthorized", message: "Bạn cần đăng nhập." });
    const body = claimBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", message: "Dữ liệu chưa đúng" });
    try {
      const machineId = await claimScan(db, uid, (req.params as { code: string }).code.slice(0, 20), body.data);
      return { machineId };
    } catch (e) {
      if (e instanceof MachineError) return reply.code(e.status).send({ error: "scan", message: e.message });
      throw e;
    }
  });
};
