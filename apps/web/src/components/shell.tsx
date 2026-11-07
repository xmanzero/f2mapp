"use client";

import { SCALE_VERSION } from "@f2m/shared";
import { Cpu, Search, Store, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Mark } from "./mark";

const NAV = [
  { href: "/", label: "Máy của tôi", short: "Máy", icon: Cpu },
  { href: "/xep-hang", label: "Bảng xếp hạng", short: "Xếp hạng", icon: Trophy },
  { href: "/cho", label: "Chợ linh kiện", short: "Chợ", icon: Store },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const current = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Điều hướng">
        <Link href="/" className="brand">
          <Mark /> f2m <small>mạng xã hội PC</small>
        </Link>
        <nav className="nav">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={current(href) ? "page" : undefined}>
              <Icon aria-hidden="true" /> {label}
            </Link>
          ))}
        </nav>
        <p className="foot">
          Thang điểm v{SCALE_VERSION}. Mốc 10.000: Core i5-12400F + RTX 3060 12GB.
        </p>
      </aside>

      <div className="main">
        <header className="topbar">
          <Link href="/" className="brand-mobile" aria-label="f2m — trang chủ">
            <Mark size={22} /> f2m
          </Link>
          <form
            className="search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/cho?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <Search aria-hidden="true" />
            <label htmlFor="q" className="sr-only">Tìm linh kiện trong chợ</label>
            <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm linh kiện: RTX 3060, i5-12400F…" />
          </form>
          <div className="scope">Toàn quốc · dữ liệu mẫu</div>
        </header>

        <main className="canvas">{children}</main>
      </div>

      <nav className="bottombar" aria-label="Điều hướng chính">
        {NAV.map(({ href, short, icon: Icon }) => (
          <Link key={href} href={href} aria-current={current(href) ? "page" : undefined}>
            <Icon aria-hidden="true" />
            {short}
          </Link>
        ))}
      </nav>
    </div>
  );
}
