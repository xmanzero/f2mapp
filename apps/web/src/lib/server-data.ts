import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Listing } from "./listings";
import type { PublicProfile } from "./profile";

/**
 * Dữ liệu công khai đọc từ API lúc dựng trang trên máy chủ (để HTML có nội dung thật cho Google và người xem lần đầu).
 * Lưu đệm vài phút; trình duyệt vẫn tải lại bản mới nhất sau khi mở trang. API không trả lời → rỗng.
 */
const API = process.env.API_URL ?? "http://localhost:8140";

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(3000) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Một tin (góc nhìn khách: không có số liên hệ). null = không có / đã ẩn / đã gỡ */
export async function publicListing(id: string): Promise<Listing | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`listing:${id}`);
  return (await get<{ item: Listing }>(`/v1/listings/${id}`))?.item ?? null;
}

/** Tin đang bán trên chợ */
export async function publicListings(): Promise<Listing[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("listings");
  return (await get<{ items: Listing[] }>("/v1/listings?limit=200"))?.items ?? [];
}

export interface BoardRow {
  userId: string; handle: string; displayName: string; province: string | null;
  cpu: string | null; gpu: string | null; ramGb: number; resolution: number; power: number; tier: string;
  bench?: { cpu: number | null; gpu: number | null } | null; likes?: number;
  laptop?: { model: string | null } | null;
}
/** Bảng xếp hạng */
export async function publicBoard(): Promise<BoardRow[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("leaderboard");
  return (await get<{ items: BoardRow[] }>("/v1/leaderboard"))?.items ?? [];
}

/** Hồ sơ công khai /u/<tên> (góc nhìn khách). null = không có / bị khóa */
export async function publicProfile(handle: string): Promise<PublicProfile | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`profile:${handle.toLowerCase()}`);
  return get<PublicProfile>(`/v1/users/${encodeURIComponent(handle)}`);
}
