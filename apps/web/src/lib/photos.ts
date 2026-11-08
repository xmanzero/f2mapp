import { ApiError } from "./api";
import type { Listing } from "./listings";

export const MAX_PHOTOS = 5;
export const photoUrl = (id: string) => `/api/v1/photos/${id}`;

/**
 * Thu nhỏ ảnh ở trình duyệt trước khi gửi: cạnh dài tối đa 1600 px, JPEG 85%.
 * Vẽ lại qua canvas nên mất luôn EXIF (vị trí GPS…), ảnh chụp dọc vẫn đúng chiều (trình duyệt tự xoay theo EXIF khi giải mã).
 */
export async function shrinkImage(file: File, maxSide = 1600): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp|heic|heif|avif|gif|bmp)$/i.test(file.type) && file.type !== "")
    throw new Error("Chỉ nhận tệp ảnh");
  const bmp = await createImageBitmap(file).catch(() => { throw new Error("Không đọc được ảnh này. Thử ảnh JPEG hoặc PNG."); });
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // ảnh PNG trong suốt → nền trắng
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
  if (!blob) throw new Error("Không nén được ảnh");
  return blob;
}

/** Gửi một ảnh cho tin (thân yêu cầu là chính tệp ảnh) */
export async function uploadPhoto(listingId: string, blob: Blob): Promise<Listing> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/listings/${listingId}/photos`, {
      method: "POST", headers: { "content-type": blob.type || "image/jpeg" }, body: blob, credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message ?? `Lỗi máy chủ (${res.status})`, data.error);
  return data.item as Listing;
}
