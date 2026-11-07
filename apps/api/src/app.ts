import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import type { GoogleVerifier } from "./auth/google.js";
import type { SmsSender } from "./auth/sms.js";
import type { DB } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { machineRoutes } from "./routes/machines.js";
import { meRoutes } from "./routes/me.js";
import { partsRoutes } from "./routes/parts.js";

export interface AppDeps {
  db: DB;
  sms: SmsSender;
  /** Bí mật dùng khi băm mã OTP */
  pepper: string;
  /** Client ID Google (web, Android, iOS). Rỗng = tắt đăng nhập Google */
  googleClientIds: string[];
  /** Chỉ dùng khi test: thay bộ xác thực token Google */
  googleVerifier?: GoogleVerifier;
  /** Trả mã OTP trong response — CHỈ bật khi chưa có nhà cung cấp SMS và chạy trong LAN */
  devOtp: boolean;
  cookieSecure: boolean;
  /** Số lần xin mã OTP tối đa mỗi giờ cho một IP (mặc định 10) */
  otpRequestsPerIpHour?: number;
}

export function buildApp(opts: { logger?: boolean; corsOrigin?: string; deps?: AppDeps } = {}) {
  // trustProxy: API đứng sau web Next.js (rewrite /api), IP thật nằm ở X-Forwarded-For
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true });
  app.register(cors, { origin: opts.corsOrigin?.split(",") ?? true, credentials: true });
  app.register(cookie);
  app.register(rateLimit, { global: false });

  app.get("/health", async () => ({ ok: true, db: !!opts.deps }));
  app.register(partsRoutes, { prefix: "/v1/parts" });
  app.register(machineRoutes, { prefix: "/v1/machines" });
  if (opts.deps) {
    app.register(authRoutes(opts.deps), { prefix: "/v1/auth" });
    app.register(meRoutes(opts.deps), { prefix: "/v1" });
  }
  return app;
}
