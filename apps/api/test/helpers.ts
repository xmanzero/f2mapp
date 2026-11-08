import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { buildApp } from "../src/app.js";
import { createGoogleVerifier } from "../src/auth/google.js";
import type { Database } from "../src/db.js";
import { syncParts } from "../src/services/machines.js";

const MIGRATIONS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../db/migrations");
export const GOOGLE_CLIENT = "test-client.apps.googleusercontent.com";

/** Postgres thật (PGlite, trong bộ nhớ) + đủ migration + app có tài khoản */
export async function setup(opts: { registerPerIpHour?: number } = {}) {
  const pg = new PGlite();
  for (const f of (await readdir(MIGRATIONS)).filter((x) => x.endsWith(".sql")).sort()) {
    // gen_random_uuid() có sẵn từ Postgres 13; PGlite không cần pgcrypto
    await pg.exec((await readFile(path.join(MIGRATIONS, f), "utf8")).replace(/create extension[^;]*;/gi, ""));
  }
  const db = new Kysely<Database>({ dialect: new PGliteDialect(pg) });
  await syncParts(db);

  // Google giả: khóa ký tạo tại chỗ, xác thực bằng đúng hàm của app
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test", alg: "RS256" };
  const googleToken = (claims: Record<string, unknown>, aud = GOOGLE_CLIENT) =>
    new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "test" }).setIssuer("https://accounts.google.com")
      .setAudience(aud).setIssuedAt().setExpirationTime("10m").sign(privateKey);

  const app = buildApp({
    deps: {
      db, googleClientIds: [GOOGLE_CLIENT],
      googleVerifier: createGoogleVerifier([GOOGLE_CLIENT], createLocalJWKSet({ keys: [jwk] })),
      cookieSecure: false, registerPerIpHour: opts.registerPerIpHour ?? 1000, loginPerIp10Min: 1000,
    },
  });
  return { app, db, googleToken, close: async () => { await app.close(); await db.destroy(); } };
}

/** Cấu hình chi tiết mẫu cho test */
export const spec = (o: Record<string, unknown> = {}) => ({
  cpu: "Core i5-12400F", gpu: "RTX 3060 12GB",
  mainboard: { model: "MSI PRO B660M-A", chipset: "B660", pcieGen: 4 },
  ram: [{ sticks: 2, perStickGb: 8, type: "DDR4", speedMhz: 3200, model: "Kingston Fury" }],
  drives: [{ interface: "nvme4", capacityGb: 1000, model: "Samsung 980 Pro", healthPct: 97, isBoot: true }],
  psu: { wattage: 650, model: "Corsair CX650", rating: "80 Plus Bronze" }, resolution: 1080, ...o,
});

/** Lùi thời điểm lắp mọi linh kiện về 1 ngày trước — để lần thay sau là "thay thật", không phải sửa nhầm */
export async function ageParts(db: Kysely<Database>) {
  await db.updateTable("machine_parts").set({ added_at: new Date(Date.now() - 86_400_000) }).execute();
}
