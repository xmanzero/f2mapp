import { buildApp, type AppDeps } from "./app.js";
import { createDb } from "./db.js";
import { expireListings } from "./services/listings.js";
import { processPending, WATERMARK } from "./services/photos.js";
import { refreshScores, syncParts } from "./services/machines.js";

const port = Number(process.env.PORT ?? 8140);
let deps: AppDeps | undefined;

if (process.env.DATABASE_URL) {
  const db = createDb(process.env.DATABASE_URL);
  await syncParts(db);
  deps = {
    db,
    googleClientIds: (process.env.GOOGLE_CLIENT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    cookieSecure: process.env.COOKIE_SECURE === "1" ? true : process.env.COOKIE_SECURE === "auto" ? "auto" : false,
    webUrl: process.env.WEB_URL || undefined,
    settingsKey: process.env.SETTINGS_KEY || undefined,
  };
}

const app = buildApp({ logger: true, corsOrigin: process.env.CORS_ORIGIN, deps });
if (!deps) app.log.warn("Chưa đặt DATABASE_URL: chỉ chạy danh mục + tính điểm, không có tài khoản");

// Tin hết hạn tự hủy: quét mỗi phút (các truy vấn chợ cũng tự quét trước khi đọc)
if (deps) {
  const db = deps.db;
  setInterval(() => {
    expireListings(db).then((n) => { if (n) app.log.info(`${n} tin hết hạn đã tự hủy`); }).catch((e) => app.log.error(e));
  }, 60_000).unref();
  // ảnh đăng trước khi có WebP + dấu: xử lý lại một lần
  refreshScores(db).then((n) => app.log.info(`Đã tính lại điểm ${n} máy theo danh mục hiện tại`)).catch((e) => app.log.error(e));
  processPending(db).then((n) => { if (n) app.log.info(`Đã đổi ${n} ảnh sang WebP + dấu ${WATERMARK}`); }).catch((e) => app.log.error(e));
}

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
