/** Gọi API qua /api (Next chuyển tiếp sang Fastify), cookie phiên đi kèm tự động. */
export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public retryIn?: number) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message ?? `Lỗi máy chủ (${res.status})`, data.error, data.retryIn);
  return data as T;
}

export interface Profile {
  id: string; handle: string; displayName: string; province: string | null; role: "user" | "admin";
  /** khu vực lọc chợ đã lưu: tên tỉnh, "all" = toàn quốc, null = chưa chọn */
  marketRegion: string | null; lastListingProvince: string | null;
  email: string | null; emailVerified: boolean; hasPassword: boolean; providers: ("password" | "google")[];
}
