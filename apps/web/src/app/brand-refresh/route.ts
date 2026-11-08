import { revalidateTag } from "next/cache";

/**
 * Trang quản trị gọi sau khi lưu Thương hiệu: bỏ bản lưu đệm để logo / slogan / favicon mới hiện ngay.
 * Chỉ quản trị viên (kiểm bằng cookie phiên qua API).
 */
export async function POST(req: Request) {
  const me = await fetch(`${process.env.API_URL ?? "http://localhost:8140"}/v1/me`, {
    headers: { cookie: req.headers.get("cookie") ?? "" }, cache: "no-store",
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { user?: { role?: string } } | null;
  if (me?.user?.role !== "admin") return Response.json({ error: "forbidden", message: "Chỉ quản trị viên." }, { status: 403 });
  revalidateTag("branding", { expire: 0 });
  return Response.json({ ok: true });
}
