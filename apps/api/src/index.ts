import { buildApp, type AppDeps } from "./app.js";
import { createDb } from "./db.js";
import { syncParts } from "./services/machines.js";

const port = Number(process.env.PORT ?? 8140);
let deps: AppDeps | undefined;

if (process.env.DATABASE_URL) {
  const db = createDb(process.env.DATABASE_URL);
  await syncParts(db);
  deps = {
    db,
    googleClientIds: (process.env.GOOGLE_CLIENT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    cookieSecure: process.env.COOKIE_SECURE === "1",
  };
}

const app = buildApp({ logger: true, corsOrigin: process.env.CORS_ORIGIN, deps });
if (!deps) app.log.warn("Chưa đặt DATABASE_URL: chỉ chạy danh mục + tính điểm, không có tài khoản");

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
