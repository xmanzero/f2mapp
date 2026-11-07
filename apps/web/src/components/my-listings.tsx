"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { vnd } from "@/lib/format";
import { daysLabel, daysSince, STATUS_LABEL, type Listing, type ListingStatus, type ReplacedPart } from "@/lib/listings";
import { useSession } from "@/lib/session";

const STATUS_CLASS: Record<ListingStatus, string> = { active: "pos", reserved: "warn", sold: "", hidden: "" };

export function MyListings() {
  const { user } = useSession();
  const [data, setData] = useState<{ items: Listing[]; replacedParts: ReplacedPart[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!user) return;
    api<{ items: Listing[]; replacedParts: ReplacedPart[] }>("/v1/me/listings").then(setData).catch(() => setFailed(true));
  }, [user]);

  if (user === undefined) return <div className="title-row"><div><h1>Tin của tôi</h1><p className="sub">Đang tải…</p></div></div>;
  if (user === null)
    return (
      <>
        <div className="title-row"><div><h1>Tin của tôi</h1><p className="sub">Cần đăng nhập.</p></div></div>
        <p className="empty"><Link href="/dang-nhap?next=/cho/cua-toi" className="card-link">Đăng nhập</Link> để xem và quản lý tin đã đăng.</p>
      </>
    );

  const items = data?.items ?? [];
  const active = items.filter((l) => l.status === "active" || l.status === "reserved").length;
  return (
    <>
      <div className="title-row">
        <div>
          <p className="crumb"><Link href="/cho" className="card-link">Chợ linh kiện</Link></p>
          <h1>Tin của tôi</h1>
          <p className="sub">{data ? `${active} tin đang bán · ${items.filter((l) => l.status === "sold").length} tin đã bán` : failed ? "Không tải được danh sách. Thử tải lại trang." : "Đang tải…"}</p>
        </div>
        <Link href="/cho/dang-tin" className="btn primary">Đăng tin bán</Link>
      </div>

      <div className="grid">
        <section className="panel s7" aria-labelledby="h-mine">
          <header><h2 id="h-mine">Tin đã đăng</h2><span className="meta">Tối đa 20 tin đang bán</span></header>
          {!data ? (
            <div aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 52, marginTop: 8 }} />)}</div>
          ) : items.length === 0 ? (
            <p className="empty">Bạn chưa đăng tin nào. <Link href="/cho/dang-tin" className="card-link">Đăng tin đầu tiên</Link></p>
          ) : (
            <ul className="rows">
              {items.map((l) => (
                <li key={l.id} className="row">
                  <div className="grow">
                    <Link href={`/cho/tin?id=${l.id}`} className="card-link">{l.name}</Link>
                    <div className="line2">đăng {daysLabel(daysSince(l.createdAt))}{l.soldAt ? ` · bán ${daysLabel(daysSince(l.soldAt))}` : ""}</div>
                  </div>
                  <span className={`pill ${STATUS_CLASS[l.status]}`}>{STATUS_LABEL[l.status]}</span>
                  <span className="num" style={{ fontWeight: 600, minWidth: 110, textAlign: "right" }}>{vnd(l.priceVnd)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel s5" aria-labelledby="h-replaced">
          <header><h2 id="h-replaced">Đã thay ra khỏi máy</h2></header>
          {!data ? (
            <div className="skeleton" style={{ height: 52 }} aria-busy="true" />
          ) : data.replacedParts.length === 0 ? (
            <p className="empty">Khi bạn đổi card hoặc CPU ở <Link href="/" className="card-link">Máy của tôi</Link>, linh kiện cũ sẽ hiện ở đây để đăng bán nhanh.</p>
          ) : (
            <ul className="rows">
              {data.replacedParts.map((p) => (
                <li key={p.id} className="row">
                  <div className="grow"><div style={{ fontWeight: 500 }}>{p.name}</div><div className="line2">{p.kind === "gpu" ? "Card đồ họa" : "CPU"} cũ trong máy của bạn</div></div>
                  <Link href={`/cho/dang-tin?mp=${p.id}`} className="btn small">Đăng bán</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
