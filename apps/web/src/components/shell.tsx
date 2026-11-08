"use client";

import { SCALE_VERSION } from "@f2m/shared";
import { Cpu, Search, ShieldCheck, Store, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { SessionProvider, useSession } from "@/lib/session";
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

function AccountControl({ path }: { path: string }) {
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

export function Shell({ children, brand }: { children: ReactNode; brand: Branding }) {
  return (
    <SessionProvider>
      <Frame brand={brand}>{children}</Frame>
    </SessionProvider>
  );
}

function Frame({ children, brand }: { children: ReactNode; brand: Branding }) {
  const { path } = splitLocale(usePathname());
  const { user } = useSession();
  const { t, p } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  const current = (href: string) => path.startsWith(href);

  // Trang chủ (landing) chiếm toàn trang, không có thanh bên / thanh trên của app
  if (path === "/") return <>{children}</>;

  return (
    <div className="app">
      <aside className="sidebar" aria-label={t.nav.sideLabel}>
        <Link href={p("/")} className="brand" aria-label={t.nav.homeLabel(brand.slogan ? `${brand.siteName}, ${brand.slogan}` : brand.siteName)}>
          <BrandLogo brand={brand} height={30} />
          {brand.slogan && <small className="brand-slogan">{brand.slogan}</small>}
        </Link>
        <nav className="nav">
          {NAV.map(({ href, key, icon: Icon }) => (
            <Link key={href} href={p(href)} aria-current={current(href) ? "page" : undefined}>
              <Icon aria-hidden="true" /> {t.nav[key]}
            </Link>
          ))}
          {user?.role === "admin" && (
            <Link href={p("/quan-tri")} aria-current={current("/quan-tri") ? "page" : undefined}>
              <ShieldCheck aria-hidden="true" /> {t.nav.admin}
            </Link>
          )}
        </nav>
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
          <AccountControl path={path} />
        </header>

        <main className="canvas">{children}</main>
      </div>

      <nav className="bottombar" aria-label={t.nav.mainLabel}>
        {NAV.map(({ href, short, icon: Icon }) => (
          <Link key={href} href={p(href)} aria-current={current(href) ? "page" : undefined}>
            <Icon aria-hidden="true" />
            {t.nav[short]}
          </Link>
        ))}
        {user?.role === "admin" && (
          <Link href={p("/quan-tri")} aria-current={current("/quan-tri") ? "page" : undefined}>
            <ShieldCheck aria-hidden="true" />
            {t.nav.admin}
          </Link>
        )}
      </nav>
    </div>
  );
}
