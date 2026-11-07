import { evaluate, machineInputSchema, resolveMachine, SCALE_VERSION, UnknownPartError } from "@f2m/shared";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { maskPhone } from "../auth/phone.js";
import { userIdFromRequest } from "../auth/session.js";
import { leaderboard, loadPrimaryMachine, savePrimaryMachine } from "../services/machines.js";
import { getProfile, HANDLE_RE } from "../services/users.js";

const patchBody = z.object({
  displayName: z.string().trim().min(2, "Tên hiển thị từ 2 ký tự").max(40).optional(),
  handle: z.string().trim().toLowerCase().regex(HANDLE_RE, "Tên tài khoản 3–20 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới").optional(),
  province: z.string().trim().max(40).nullable().optional(),
});

export const meRoutes = (deps: AppDeps): FastifyPluginAsync => async (app) => {
  const { db } = deps;
  const requireUser = async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = await userIdFromRequest(db, req);
    if (!uid) reply.code(401).send({ error: "unauthorized", message: "Bạn cần đăng nhập." });
    return uid;
  };
  const publicProfile = async (uid: string) => {
    const p = await getProfile(db, uid);
    return p && { ...p, phone: p.phone ? maskPhone(p.phone) : null };
  };

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
    const { displayName, handle, province } = body.data;
    if (handle) {
      const taken = await db.selectFrom("users").select("id").where("handle", "=", handle).where("id", "!=", uid).executeTakeFirst();
      if (taken) return reply.code(409).send({ error: "handle_taken", message: `Tên tài khoản "${handle}" đã có người dùng.` });
    }
    const set = {
      ...(displayName !== undefined && { display_name: displayName }),
      ...(handle !== undefined && { handle }),
      ...(province !== undefined && { province: province || null }),
    };
    if (Object.keys(set).length) await db.updateTable("users").set(set).where("id", "=", uid).execute();
    return { user: await publicProfile(uid) };
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
};
