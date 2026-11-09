/**
 * Gọi API pcdex qua web (web chuyển /api sang API). Đăng nhập bằng token (header Authorization: Bearer), không dùng cookie.
 * Đổi máy chủ bằng biến EXPO_PUBLIC_API_URL (VD http://192.168.110.136:8141/api khi thử trong mạng nội bộ).
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "https://pcdex.app/api").replace(/\/+$/, "");
export const WEB_URL = API_URL.replace(/\/api$/, "");

let token: string | null = null;
let lang: "vi" | "en" = "vi";
export const setApiToken = (t: string | null) => { token = t; };
export const setApiLang = (l: "vi" | "en") => { lang = l; };
export const authHeaders = (): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {});

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; raw?: Blob | ArrayBuffer; contentType?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body !== undefined || init.raw ? "POST" : "GET"),
      headers: {
        "x-lang": lang, ...authHeaders(),
        ...(init.body !== undefined ? { "content-type": "application/json" } : init.raw ? { "content-type": init.contentType ?? "image/jpeg" } : {}),
      },
      body: init.raw ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    });
  } catch {
    throw new ApiError(0, lang === "en" ? "Can’t reach pcdex. Check your connection." : "Không kết nối được pcdex. Kiểm tra mạng.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { message?: string }).message ?? `HTTP ${res.status}`, (data as { error?: string }).error);
  return data as T;
}

export const photoUrl = (id: string) => `${API_URL}/v1/photos/${id}`;
export const messageImage = (id: string) => ({ uri: `${API_URL}/v1/messages/images/${id}`, headers: authHeaders() });
