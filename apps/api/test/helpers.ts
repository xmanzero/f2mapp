import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { buildApp } from "../src/app.js";
import { createGoogleVerifier } from "../src/auth/google.js";
import { ConsoleSms } from "../src/auth/sms.js";
import type { Database } from "../src/db.js";
import { syncParts } from "../src/services/machines.js";

const MIGRATIONS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../db/migrations");
export const GOOGLE_CLIENT = "test-client.apps.googleusercontent.com";

/** Postgres thật (PGlite, trong bộ nhớ) + đủ migration + app có tài khoản */
export async function setup(opts: { otpRequestsPerIpHour?: number } = {}) {
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

  const sms = new ConsoleSms(() => {});
  const app = buildApp({
    deps: {
      db, sms, pepper: "test-pepper-0123456789", googleClientIds: [GOOGLE_CLIENT],
      googleVerifier: createGoogleVerifier([GOOGLE_CLIENT], createLocalJWKSet({ keys: [jwk] })),
      devOtp: true, cookieSecure: false, otpRequestsPerIpHour: opts.otpRequestsPerIpHour ?? 1000,
    },
  });
  return { app, db, sms, googleToken, close: async () => { await app.close(); await db.destroy(); } };
}
