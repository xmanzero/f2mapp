"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useId } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { LANG_COOKIE, LOCALES, localePath, splitLocale, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/client";

/** Đổi ngôn ngữ: giữ nguyên trang đang xem, nhớ lựa chọn (cookie + tài khoản để email gửi đúng ngôn ngữ) */
function Switch({ className }: { className?: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { user } = useSession();
  const next: Locale = LOCALES.find((l) => l !== locale) ?? locale;
  const go = () => {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    if (user) api("/v1/me", { method: "PATCH", body: { locale: next } }).catch(() => {});
    const qs = search.toString();
    router.push(localePath(next, splitLocale(pathname).path) + (qs ? `?${qs}` : ""));
  };
  return (
    <button type="button" className={className ?? "lang-switch"} onClick={go} aria-label={t.lang.switchTo} title={t.lang.switchTo} lang={next}>
      <Flag locale={next} /><span className="lang-code">{next.toUpperCase()}</span>
    </button>
  );
}

/**
 * Cờ của ngôn ngữ (SVG, không dùng emoji: Windows không vẽ emoji cờ, chỉ hiện chữ "GB" / "VN").
 * Tiếng Anh dùng cờ Anh. Thêm ngôn ngữ: thêm một nhánh ở đây.
 */
function Flag({ locale }: { locale: Locale }) {
  const id = useId().replace(/:/g, "");
  if (locale === "vi")
    return (
      <svg className="flag" viewBox="0 0 30 20" aria-hidden="true">
        <rect width="30" height="20" fill="#DA251D" />
        <polygon fill="#FFFF00" points="15,4 16.35,8.14 20.71,8.15 17.19,10.71 18.53,14.85 15,12.3 11.47,14.85 12.81,10.71 9.29,8.15 13.65,8.14" />
      </svg>
    );
  return (
    <svg className="flag" viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <clipPath id={`${id}t`}><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
      </defs>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFFFFF" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${id}t)`} stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#FFFFFF" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

export function LangSwitch(props: { className?: string }) {
  return <Suspense fallback={null}><Switch {...props} /></Suspense>;
}
