"use client";

import { Languages } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
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
      <Languages aria-hidden="true" /><span>{next.toUpperCase()}</span>
    </button>
  );
}

export function LangSwitch(props: { className?: string }) {
  return <Suspense fallback={null}><Switch {...props} /></Suspense>;
}
