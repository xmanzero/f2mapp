import { compareUpgrade, evaluate, machineInputSchema, resolveMachine, SCALE_VERSION, UnknownPartError } from "@f2m/shared";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";

const compareSchema = z.object({ current: machineInputSchema, next: machineInputSchema });

function badRequest(reply: FastifyReply, message: string, issues?: unknown) {
  return reply.code(400).send({ error: "bad_request", message, issues });
}

export const machineRoutes: FastifyPluginAsync = async (app) => {
  /** Tính điểm một cấu hình (chưa lưu) */
  app.post("/evaluate", async (req, reply) => {
    const parsed = machineInputSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, "Cấu hình không hợp lệ", parsed.error.issues);
    try {
      return { scaleVersion: SCALE_VERSION, ...evaluate(resolveMachine(parsed.data)) };
    } catch (e) {
      if (e instanceof UnknownPartError) return badRequest(reply, e.message);
      throw e;
    }
  });

  /** So sánh trước / sau nâng cấp */
  app.post("/compare", async (req, reply) => {
    const parsed = compareSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, "Cấu hình không hợp lệ", parsed.error.issues);
    try {
      return { scaleVersion: SCALE_VERSION, ...compareUpgrade(resolveMachine(parsed.data.current), resolveMachine(parsed.data.next)) };
    } catch (e) {
      if (e instanceof UnknownPartError) return badRequest(reply, e.message);
      throw e;
    }
  });
};
