"use client";

import { SCALE_VERSION } from "@f2m/shared";
import { Cpu, Search, ShieldCheck, Store, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { useSession } from "@/lib/session";
import type { Branding } from "@/lib/branding-shared";
import { splitLocale } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import { BrandLogo, BrandMark } from "./brand-logo";
import { LangSwitch } from "./lang-switch";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/may", key: "machine", short: "machineShort", icon: Cpu },
  { href: "/xep-hang", key: "board", short: "boardShort", icon: Trophy },
  { href: "/cho", key: "market", short: "marketShort", icon: Store },
] as const;

/**
 * Đọc địa chỉ đang mở. Chỉ các phần nhỏ (đánh dấu menu, nút đăng nhập) dùng, và luôn nằm trong <Suspense>:
 * với trang có tham số động (tin rao /cho/<tên>-<id>) địa chỉ chưa biết lúc dựng sẵn, phần còn lại của khung vẫn dựng sẵn được.
 */
const usePath = () => splitLocale(usePathname()).path;

function AccountInner() {
  const path = usePath();
  const { user } = useSession();
  const { t, p } = useI18n();
  if (user === undefined) return <div className="account" aria-hidden="true"><span className="skeleton" style={{ width: 32, height: 32, borderRadius: 999 }} /></div>;
  if (user === null)
    return path === "/dang-nhap" ? null : (
      <div className="account">
        <Link href={`${p("/dang-nhap")}?next=${encodeURIComponent(path)}`} className="btn small primary">{t.common.login}</Link>
      </div>
    );
  return (
    <div className="account">
      <Link href={p("/tai-khoan")} className="me" aria-label={t.nav.accountOf(user.displayName)}>
        <span className="avatar" style={{ background: "var(--accent)" }} aria-hidden="true">{user.displayName.trim()[0]?.toUpperCase() ?? "?"}</span>
        <span className="who"><span>{user.displayName}</span><small>@{user.handle}</small></span>
      </Link>
    </div>
  );
}
const AccountControl = () => (
  <Suspense fallback={<div className="account" aria-hidden="true"><span className="skeleton" style={{ width: 32, height: 32, borderRadius: 999 }} /></div>}>
    <AccountInner />
  </Suspense>
);

/** Các mục menu; `path` = null khi chưa biết địa chỉ (bản dựng sẵn) thì chưa đánh dấu mục nào */
function NavItems({ path, short }: { path: string | null; short?: boolean }) {
  const { user } = useSession();
  const { t, p } = useI18n();
  const current = (href: string) => (path?.startsWith(href) ? "page" as const : undefined);
  return (
    <>
      {NAV.map(({ href, key, short: s, icon: Icon }) => (
        <Link key={href} href={p(href)} aria-current={current(href)}>
          <Icon aria-hidden="true" />{short ? t.nav[s] : <> {t.nav[key]}</>}
        </Link>
      ))}
      {user?.role === "admin" && (
        <Link href={p("/quan-tri")} aria-current={current("/quan-tri")}>
          <ShieldCheck aria-hidden="true" />{short ? t.nav.admin : <> {t.nav.admin}</>}
        </Link>
      )}
    </>
  );
}
function CurrentNav({ short }: { short?: boolean }) {
  return <NavItems path={usePath()} short={short} />;
}
const Nav = ({ short }: { short?: boolean }) => (
  <Suspense fallback={<NavItems path={null} short={short} />}><CurrentNav short={short} /></Suspense>
);

/** Khung app: thanh bên, thanh trên (tìm kiếm, ngôn ngữ, Ngày / Đêm, tài khoản), thanh dưới trên điện thoại */
export function Shell({ children, brand }: { children: ReactNode; brand: Branding }) {
  const { t, p } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <div className="app">
      <aside className="sidebar" aria-label={t.nav.sideLabel}>
        <Link href={p("/")} className="brand" aria-label={t.nav.homeLabel(brand.slogan ? `${brand.siteName}, ${brand.slogan}` : brand.siteName)}>
          <BrandLogo brand={brand} height={30} />
          {brand.slogan && <small className="brand-slogan">{brand.slogan}</small>}
        </Link>
        <nav className="nav"><Nav /></nav>
        <p className="foot">
          {t.nav.scaleNote(SCALE_VERSION)}
          <br /><Link href={p("/chinh-sach-quyen-rieng-tu")}>{t.nav.privacy}</Link> · <Link href={p("/dieu-khoan")}>{t.nav.terms}</Link>
        </p>
      </aside>

      <div className="main">
        <header className="topbar">
          <Link href={p("/")} className="brand-mobile" aria-label={t.nav.homeLabel(brand.siteName)}>
            <BrandMark brand={brand} size={30} />
          </Link>
          <form
            className="search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`${p("/cho")}?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <Search aria-hidden="true" />
            <label htmlFor="q" className="sr-only">{t.nav.searchLabel}</label>
            <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.nav.searchPlaceholder} />
          </form>
          <LangSwitch />
          <ThemeToggle />
          <AccountControl />
        </header>

        <main className="canvas">{children}</main>
      </div>

      <nav className="bottombar" aria-label={t.nav.mainLabel}><Nav short /></nav>
    </div>
  );
}
