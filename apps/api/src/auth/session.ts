import { createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DB } from "../db.js";

export const SESSION_COOKIE = "f2m_session";
export const SESSION_TTL_MS = 60 * 24 * 60 * 60_000; // 60 ngày

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(db: DB, userId: string, userAgent: string | undefined) {
  const token = randomBytes(32).toString("base64url");
  await db.insertInto("sessions").values({
    token_hash: hash(token), user_id: userId, user_agent: userAgent?.slice(0, 300) ?? null,
    expires_at: new Date(Date.now() + SESSION_TTL_MS),
  }).execute();
  return token;
}

/** Token từ cookie (web) hoặc header Authorization: Bearer (app) */
export function tokenFrom(req: FastifyRequest): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  return req.cookies?.[SESSION_COOKIE] ?? null;
}

export async function userIdFromRequest(db: DB, req: FastifyRequest): Promise<string | null> {
  const token = tokenFrom(req);
  if (!token) return null;
  const row = await db.selectFrom("sessions").select(["user_id", "last_seen_at"])
    .where("token_hash", "=", hash(token)).where("expires_at", ">", new Date()).executeTakeFirst();
  if (!row) return null;
  // cập nhật lần dùng cuối tối đa mỗi giờ một lần
  if (Date.now() - new Date(row.last_seen_at).getTime() > 3600_000)
    await db.updateTable("sessions").set({ last_seen_at: new Date() }).where("token_hash", "=", hash(token)).execute();
  return row.user_id;
}

export async function revokeSession(db: DB, req: FastifyRequest) {
  const token = tokenFrom(req);
  if (token) await db.deleteFrom("sessions").where("token_hash", "=", hash(token)).execute();
}

export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean) {
  reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: SESSION_TTL_MS / 1000 });
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean) {
  reply.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure, path: "/" });
}
