import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { z } from "zod";
import type { DB } from "../db.js";

/**
 * Cấu hình hệ thống (bảng app_settings). Mật khẩu mã hóa AES-256-GCM bằng khóa lấy từ SETTINGS_KEY;
 * không bao giờ trả bản rõ ra API (chỉ báo "đã có mật khẩu").
 */
export class SettingsError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const keyOf = (secret: string) => createHash("sha256").update(`pcdex-settings:${secret}`).digest();

export function encrypt(secret: string, plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${data.toString("base64")}`;
}
export function decrypt(secret: string, box: string) {
  const [v, iv, tag, data] = box.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new SettingsError(500, "Dữ liệu mã hóa không hợp lệ");
  const d = createDecipheriv("aes-256-gcm", keyOf(secret), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

// ---------- SMTP ----------
export const smtpInput = z.object({
  host: z.string().trim().min(3, "Nhập máy chủ SMTP").max(200),
  port: z.number().int().min(1).max(65535),
  /** ssl = TLS ngay từ đầu (thường cổng 465); starttls = nâng cấp lên TLS (thường 587); none = không mã hóa (chỉ dùng nội bộ) */
  security: z.enum(["ssl", "starttls", "none"]),
  user: z.string().trim().max(200).default(""),
  /** bỏ trống = giữ mật khẩu cũ; null = xóa mật khẩu */
  password: z.string().max(500).nullable().optional(),
  fromName: z.string().trim().max(80).default("pcdex"),
  fromEmail: z.string().trim().email("Email người gửi chưa đúng").max(200),
  enabled: z.boolean().default(true),
});
export type SmtpInput = z.infer<typeof smtpInput>;
interface SmtpStored extends Omit<SmtpInput, "password"> { passwordBox: string | null }

export async function getSmtpStored(db: DB): Promise<SmtpStored | null> {
  const r = await db.selectFrom("app_settings").select("value").where("key", "=", "smtp").executeTakeFirst();
  return (r?.value as SmtpStored | undefined) ?? null;
}

/** Cấu hình hiện có, để hiện trên trang quản trị (không có mật khẩu) */
export async function getSmtpPublic(db: DB) {
  const s = await getSmtpStored(db);
  if (!s) return null;
  const { passwordBox, ...rest } = s;
  return { ...rest, hasPassword: !!passwordBox };
}

export async function saveSmtp(db: DB, secret: string | undefined, input: SmtpInput, adminId: string) {
  const old = await getSmtpStored(db);
  let passwordBox = old?.passwordBox ?? null;
  if (input.password === null) passwordBox = null;
  else if (input.password) {
    if (!secret) throw new SettingsError(500, "Máy chủ chưa có SETTINGS_KEY nên chưa lưu được mật khẩu. Thêm SETTINGS_KEY vào .env rồi khởi động lại API.");
    passwordBox = encrypt(secret, input.password);
  }
  const { password: _p, ...rest } = input;
  const value: SmtpStored = { ...rest, passwordBox };
  await db.insertInto("app_settings").values({ key: "smtp", value: JSON.stringify(value), updated_by: adminId })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value: JSON.stringify(value), updated_at: new Date(), updated_by: adminId })).execute();
  return getSmtpPublic(db);
}

/** Bộ gửi thư theo cấu hình đã lưu; null nếu chưa cấu hình / đang tắt */
export async function mailer(db: DB, secret: string | undefined) {
  const s = await getSmtpStored(db);
  if (!s || !s.enabled) return null;
  const pass = s.passwordBox ? (secret ? decrypt(secret, s.passwordBox) : null) : null;
  if (s.passwordBox && !pass) throw new SettingsError(500, "Không giải mã được mật khẩu SMTP (thiếu SETTINGS_KEY).");
  const transport = nodemailer.createTransport({
    host: s.host, port: s.port, secure: s.security === "ssl", requireTLS: s.security === "starttls",
    ignoreTLS: s.security === "none",
    auth: s.user ? { user: s.user, pass: pass ?? "" } : undefined,
    connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000,
  });
  const from = { name: s.fromName || "pcdex", address: s.fromEmail };
  return {
    send: (to: string, subject: string, text: string, html?: string) => transport.sendMail({ from, to, subject, text, html }),
    verify: () => transport.verify(),
  };
}
