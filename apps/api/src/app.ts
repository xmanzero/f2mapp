import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import type { GoogleVerifier } from "./auth/google.js";
import type { DB } from "./db.js";
import type { MailSender } from "./services/email.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { listingRoutes } from "./routes/listings.js";
import { machineRoutes } from "./routes/machines.js";
import { meRoutes } from "./routes/me.js";
import { partsRoutes } from "./routes/parts.js";
import { scanRoutes } from "./routes/scans.js";

export interface AppDeps {
  db: DB;
  /** Client ID Google (web, Android, iOS). Rỗng = tắt đăng nhập Google */
  googleClientIds: string[];
  /** Chỉ dùng khi test: thay bộ xác thực token Google */
  googleVerifier?: GoogleVerifier;
  /** Cookie chỉ gửi qua HTTPS. "auto": bật khi người dùng vào bằng HTTPS (qua Cloudflare), tắt khi vào LAN bằng http */
  cookieSecure: boolean | "auto";
  /** Giới hạn theo IP (mặc định 10 đăng ký/giờ, 30 lần đăng nhập/10 phút) — test đặt cao hơn */
  registerPerIpHour?: number;
  loginPerIp10Min?: number;
  /** Địa chỉ web (QR của phần mềm quét trỏ tới WEB_URL/quet). Trống = lấy theo yêu cầu */
  webUrl?: string;
  /** Khóa mã hóa mật khẩu trong cấu hình hệ thống (SMTP…). Trống = không lưu được mật khẩu */
  settingsKey?: string;
  /** Chỉ dùng khi test: thay việc gửi qua SMTP */
  sendMail?: MailSender;
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
    app.register(listingRoutes(opts.deps), { prefix: "/v1" });
    app.register(scanRoutes(opts.deps), { prefix: "/v1" });
    app.register(adminRoutes(opts.deps), { prefix: "/v1" });
  }
  return app;
}
