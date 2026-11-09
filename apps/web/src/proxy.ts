import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale, LANG_COOKIE, localePath, splitLocale } from "./i18n/config";
import { isListingId, listingPath } from "./lib/listing-url";

/**
 * Định tuyến theo ngôn ngữ. Trang nằm ở app/[lang]/…:
 * - /en/… → phục vụ thẳng (lang = en)
 * - /vi/… → chuyển hẳn về địa chỉ không tiền tố (một địa chỉ cho mỗi trang)
 * - còn lại → viết lại ngầm thành /vi/… (tiếng Việt giữ địa chỉ cũ)
 * Lần đầu vào trang chủ (chưa chọn ngôn ngữ) mà trình duyệt không ưu tiên tiếng Việt → chuyển sang /en.
 */
/**
 * Địa chỉ cũ của tin rao /cho/tin?id=<uuid> → chuyển hẳn (308) sang địa chỉ riêng /cho/<tên>-<tỉnh>-<id>.
 * Làm ở đây (trước khi dựng trang) để Google nhận đúng mã chuyển hướng; tin mẫu và tin không còn thì để trang tự xử lý.
 */
async function oldListingUrl(req: NextRequest) {
  const { locale, path } = splitLocale(req.nextUrl.pathname);
  const id = req.nextUrl.searchParams.get("id")?.toLowerCase() ?? "";
  if (path !== "/cho/tin" || !isListingId(id)) return null;
  try {
    const r = await fetch(`${process.env.API_URL ?? "http://localhost:8140"}/v1/listings/${id}`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return null;
    const { item } = (await r.json()) as { item: { id: string; name: string; province: string | null } };
    const url = req.nextUrl.clone();
    url.pathname = localePath(locale, listingPath(item));
    url.searchParams.delete("id");
    return NextResponse.redirect(url, 308);
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // tệp tĩnh (có đuôi: .svg, .webp, .exe…) đi thẳng — trừ hồ sơ /u/<tên> (tên đăng nhập có thể có dấu chấm: minh.tran)
  if (/\.[a-zA-Z0-9]+$/.test(pathname) && !/^\/(?:[a-z]{2}\/)?u\/[^/]+$/.test(pathname)) return NextResponse.next();
  const moved = await oldListingUrl(req);
  if (moved) return moved;
  const first = pathname.split("/")[1];
  if (isLocale(first) && first !== DEFAULT_LOCALE) return NextResponse.next();
  if (first === DEFAULT_LOCALE) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(DEFAULT_LOCALE.length + 1) || "/";
    return NextResponse.redirect(url, 308);
  }
  if (pathname === "/" && !req.cookies.get(LANG_COOKIE)) {
    const pref = req.headers.get("accept-language")?.split(",")[0]?.trim().slice(0, 2).toLowerCase();
    if (pref && pref !== "vi" && isLocale("en")) {
      const url = req.nextUrl.clone();
      url.pathname = "/en";
      return NextResponse.redirect(url, 307);
    }
  }
  const url = req.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // bỏ qua API, tệp tĩnh (có dấu chấm), nội bộ Next, /brand-refresh
  matcher: ["/((?!api/|_next/|brand-refresh).*)"],
};
