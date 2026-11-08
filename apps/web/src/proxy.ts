import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale, LANG_COOKIE } from "./i18n/config";

/**
 * Định tuyến theo ngôn ngữ. Trang nằm ở app/[lang]/…:
 * - /en/… → phục vụ thẳng (lang = en)
 * - /vi/… → chuyển hẳn về địa chỉ không tiền tố (một địa chỉ cho mỗi trang)
 * - còn lại → viết lại ngầm thành /vi/… (tiếng Việt giữ địa chỉ cũ)
 * Lần đầu vào trang chủ (chưa chọn ngôn ngữ) mà trình duyệt không ưu tiên tiếng Việt → chuyển sang /en.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // tệp tĩnh (có đuôi: .svg, .webp, .exe…) đi thẳng
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) return NextResponse.next();
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
