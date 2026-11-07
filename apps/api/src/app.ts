import cors from "@fastify/cors";
import Fastify from "fastify";
import { partsRoutes } from "./routes/parts.js";
import { machineRoutes } from "./routes/machines.js";

export function buildApp(opts: { logger?: boolean; corsOrigin?: string } = {}) {
  const app = Fastify({ logger: opts.logger ?? false });
  app.register(cors, { origin: opts.corsOrigin?.split(",") ?? true });

  app.get("/health", async () => ({ ok: true }));
  app.register(partsRoutes, { prefix: "/v1/parts" });
  app.register(machineRoutes, { prefix: "/v1/machines" });
  return app;
}
