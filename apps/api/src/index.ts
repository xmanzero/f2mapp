import { buildApp, type AppDeps } from "./app.js";
import { createSmsSender } from "./auth/sms.js";
import { createDb } from "./db.js";
import { syncParts } from "./services/machines.js";

const port = Number(process.env.PORT ?? 8140);
let deps: AppDeps | undefined;

if (process.env.DATABASE_URL) {
  const pepper = process.env.AUTH_PEPPER;
  if (!pepper || pepper.length < 16) throw new Error("Thiếu AUTH_PEPPER (chuỗi bí mật ≥ 16 ký tự)");
  const db = createDb(process.env.DATABASE_URL);
  await syncParts(db);
  deps = {
    db,
    sms: createSmsSender(),
    pepper,
    googleClientIds: (process.env.GOOGLE_CLIENT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    devOtp: process.env.AUTH_DEV_OTP === "1",
    cookieSecure: process.env.COOKIE_SECURE === "1",
  };
}

const app = buildApp({ logger: true, corsOrigin: process.env.CORS_ORIGIN, deps });
if (!deps) app.log.warn("Chưa đặt DATABASE_URL: chỉ chạy danh mục + tính điểm, không có tài khoản");
if (deps?.devOtp) app.log.warn("AUTH_DEV_OTP=1: mã OTP được trả về trong response — chỉ dùng thử nghiệm trong LAN");

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
