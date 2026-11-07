import { createHash, randomInt } from "node:crypto";

/**
 * Chuẩn hóa số di động Việt Nam về dạng +84XXXXXXXXX.
 * Nhận "0912 345 678", "+84 912.345.678", "84912345678". Đầu số di động: 3, 5, 7, 8, 9.
 */
export function normalizeVnPhone(raw: string): string | null {
  const digits = raw.replace(/[\s.\-()]/g, "");
  const m = /^(?:\+?84|0)([35789]\d{8})$/.exec(digits);
  return m ? `+84${m[1]}` : null;
}

/** Hiển thị 0912 *** 678 */
export function maskPhone(e164: string): string {
  const local = `0${e164.slice(3)}`;
  return `${local.slice(0, 4)} *** ${local.slice(-3)}`;
}

export const newOtpCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

export const hashOtp = (pepper: string, phone: string, code: string) =>
  createHash("sha256").update(`${pepper}:${phone}:${code}`).digest("hex");

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_MS = 60_000;
export const OTP_MAX_PER_HOUR = 5;
