/**
 * Địa chỉ riêng của tin rao (cho Google và chia sẻ): /cho/<tên-linh-kiện>-<tỉnh>-<id>
 * VD /cho/rtx-3060-12gb-ha-noi-0f3a…  Phần chữ chỉ để đọc; id (UUID cuối địa chỉ) mới là khóa.
 * Tin mẫu (không có UUID) vẫn dùng /cho/tin?id=…
 */
const UUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export const isListingId = (s: string) => UUID.test(s) && s.length === 36;

/** "RTX 3060 12GB · Hà Nội" → "rtx-3060-12gb-ha-noi" */
export function slugify(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70).replace(/-+$/, "");
}

/** Đường dẫn (không có tiền tố ngôn ngữ) của một tin */
export function listingPath(l: { id: string; name: string; province?: string | null }) {
  if (!isListingId(l.id)) return `/cho/tin?id=${encodeURIComponent(l.id)}`;
  const words = slugify([l.name, l.province].filter(Boolean).join(" "));
  return `/cho/${words ? `${words}-` : ""}${l.id}`;
}

/** Lấy id từ phần cuối địa chỉ */
export function idFromSlug(slug: string) {
  return UUID.exec(slug)?.[1]?.toLowerCase() ?? null;
}
