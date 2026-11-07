import { CPUS, GPUS, SCALE_VERSION, SOCKET_MEMORY } from "@f2m/shared";
import type { FastifyPluginAsync } from "fastify";

/** Danh mục linh kiện (chỉ đọc). Sau này chuyển sang bảng `parts` trong Postgres. */
export const partsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => ({ scaleVersion: SCALE_VERSION, cpus: CPUS.length, gpus: GPUS.length }));
  app.get("/cpus", async () => ({
    scaleVersion: SCALE_VERSION,
    items: CPUS.map((c) => ({ ...c, memory: SOCKET_MEMORY[c.socket] })),
  }));
  app.get("/gpus", async () => ({ scaleVersion: SCALE_VERSION, items: GPUS }));
};
