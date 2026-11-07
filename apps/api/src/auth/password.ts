import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const scrypt = (pw: string, salt: Buffer, len: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(pw, salt, len, opts, (e, k) => (e ? reject(e) : resolve(k))));

const N = 16384, R = 8, P = 1, LEN = 32;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Băm mật khẩu: "scrypt$N$r$p$salt$hash" (base64url) */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw.normalize("NFKC"), salt, LEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(pw.normalize("NFKC"), Buffer.from(salt, "base64url"), expected.length,
    { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(key, expected);
}

/** Băm giả để thời gian trả lời như nhau khi email không tồn tại */
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= hashPassword("khong-ton-tai-" + randomBytes(8).toString("hex")));

export const LOGIN_MAX_FAILS = 5;
export const LOGIN_LOCK_MS = 15 * 60_000;
