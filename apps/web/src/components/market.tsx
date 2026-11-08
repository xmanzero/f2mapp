"use client";

import { resolveMachine } from "@f2m/shared";
import { X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { n0, signedPct, vnd } from "@/lib/format";
import {
  CONDITION_LABEL, daysLabel, fitFor, KIND_LABEL, lifeOf, MIN_REAL_LISTINGS, rowTimes, SAMPLE_ROWS, toRow, valueOf,
  type Listing, type ListingKind, type MarketRow,
} from "@/lib/listings";
import { useSession } from "@/lib/session";
import { useMachine } from "@/lib/use-machine";
import { useNow } from "@/lib/use-now";
import { photoUrl } from "@/lib/photos";
import { LifeBar } from "./life-bar";

const KIND_SHORT: Record<ListingKind, string> = { gpu: "VGA", cpu: "CPU", mainboard: "MAIN", ram: "RAM", storage: "SSD", psu: "PSU" };
/** Ảnh bìa nhỏ của tin; tin chưa có ảnh thì hiện ô ghi loại linh kiện */
function Thumb({ r }: { r: MarketRow }) {
  return (
    <span className="thumb" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {r.photo ? <img src={photoUrl(r.photo)} alt="" loading="lazy" /> : <span>{KIND_SHORT[r.kind]}</span>}
      {r.photoCount > 1 && <small className="num">{r.photoCount}</small>}
    </span>
  );
}

const KINDS: (ListingKind | "all")[] = ["all", "gpu", "cpu", "mainboard", "ram", "storage", "psu"];
type Sort = "new" | "ending" | "value" | "gain";
const KIND_ORDER: Record<ListingKind, number> = { gpu: 0, cpu: 1, mainboard: 2, ram: 3, storage: 4, psu: 5 };

export function Market() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useSession();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [kind, setKind] = useState<ListingKind | "all">("all");
  const [sort, setSort] = useState<Sort>("new");
  const [real, setReal] = useState<MarketRow[] | null>(null);
  const { machine, isSample, ready } = useMachine();
  const now = useNow();

  useEffect(() => { setQ(params.get("q") ?? ""); }, [params]);
  useEffect(() => {
    api<{ items: Listing[] }>("/v1/listings?limit=200").then((r) => setReal(r.items.map(toRow))).catch(() => setReal([]));
  }, []);

  const mine = useMemo(() => (ready ? resolveMachine(machine) : null), [ready, machine]);
  const all = useMemo(() => [...(real ?? []), ...((real?.length ?? 0) < MIN_REAL_LISTINGS ? SAMPLE_ROWS : [])], [real]);
  const rows = useMemo(() => all
    .map((r) => {
      const t = now ? rowTimes(r, now) : null;
      return { r, fit: fitFor(r.kind, r.partName, mine), value: valueOf(r.kind, r.partName, r.priceVnd), life: t && now ? lifeOf(t.created, t.expires, now) : null };
    })
    // tin hết hạn tự hủy: không hiện (máy chủ đã lọc tin thật; đây là cho tin mẫu và tin vừa hết hạn khi trang đang mở)
    .filter((x) => x.life?.state !== "expired"), [all, mine, now]);
  const scoped = rows.filter(({ r }) => !q || r.name.toLowerCase().includes(q.toLowerCase()));
  const shown = scoped
    .filter(({ r }) => kind === "all" || r.kind === kind)
    .sort((a, b) =>
      sort === "new" ? (b.life?.created ?? 0) - (a.life?.created ?? 0) || Number(a.r.sample) - Number(b.r.sample)
      : sort === "ending" ? (a.life?.expires ?? 0) - (b.life?.expires ?? 0)
      // điểm card và điểm CPU không so được với nhau: nhóm theo loại rồi mới xếp
      : sort === "value" ? KIND_ORDER[a.r.kind] - KIND_ORDER[b.r.kind] || (b.value ?? -1) - (a.value ?? -1)
      : (b.fit.gain ?? -9) - (a.fit.gain ?? -9));

  // Phát hiện: tin tăng điểm máy bạn nhiều nhất trên mỗi triệu đồng
  const best = mine && [...rows].filter((x) => (x.fit.gain ?? 0) > 0.02)
    .sort((a, b) => b.fit.gain! / b.r.priceVnd - a.fit.gain! / a.r.priceVnd)[0];
  const realCount = real?.length ?? 0;
  const postHref = user ? "/cho/dang-tin" : "/dang-nhap?next=/cho/dang-tin";

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Chợ linh kiện</h1>
          <p className="sub">
            {best ? <>Đáng tiền nhất cho máy {isSample ? "mẫu" : "của bạn"}: <b>{best.r.name}</b> {vnd(best.r.priceVnd)}, tăng {Math.round(best.fit.gain! * 100)}% điểm sức mạnh.</>
              : "Linh kiện cũ do người chơi đăng bán. Giá do người bán đặt."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {user && <Link href="/cho/cua-toi" className="btn">Tin của tôi</Link>}
          <Link href={postHref} className="btn primary">Đăng tin bán</Link>
        </div>
      </div>

      <div className="counts" role="group" aria-label="Lọc theo loại linh kiện">
        {KINDS.map((k) => (
          <button key={k} className="count" aria-pressed={kind === k} onClick={() => setKind(k)}>
            <span className="label">{k === "all" ? "Tất cả" : KIND_LABEL[k]}</span>
            <span className="value num">{scoped.filter(({ r }) => k === "all" || r.kind === k).length}</span>
          </button>
        ))}
      </div>

      <section className="panel" aria-labelledby="h-list">
        <header>
          <h2 id="h-list">{kind === "all" ? "Tất cả" : KIND_LABEL[kind]} · <span className="num">{shown.length}</span> tin</h2>
          <span className="meta">{real === null ? "Đang tải…" : `${realCount} tin thật${realCount < MIN_REAL_LISTINGS ? " + tin mẫu" : ""}`}</span>
        </header>
        <div className="toolbar">
          <div className="segmented wrap" role="group" aria-label="Sắp xếp">
            {([["new", "Mới nhất"], ["ending", "Sắp hết hạn"], ["value", "Đáng tiền"], ["gain", "Hợp máy tôi"]] as const).map(([k, l]) => (
              <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>
            ))}
          </div>
          <span className="spacer" />
          {q && (
            <button className="btn small" onClick={() => { setQ(""); router.replace("/cho"); }}>
              Tìm “{q}” <X size={14} aria-hidden="true" /><span className="sr-only">Bỏ tìm</span>
            </button>
          )}
        </div>

        {real === null ? (
          <div aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 52, marginTop: 8 }} />)}</div>
        ) : shown.length === 0 ? (
          <p className="empty">{q ? `Không có tin nào khớp “${q}”${kind !== "all" ? " trong mục này" : ""}.` : "Chưa có tin nào trong mục này."} <Link href={postHref} className="card-link">Đăng tin bán</Link></p>
        ) : (
          <>
          {/* điện thoại: danh sách dòng hai tầng thay cho bảng */}
          <ul className="mlist show-sm-block" aria-label="Tin rao">
            {shown.map(({ r, fit, life }) => (
              <li key={r.id} className={[r.href ? "linked clickable" : "", life ? `life-${life.state}` : ""].join(" ").trim() || undefined}
                onClick={() => r.href && router.push(r.href)}>
                <div className="l1">
                  <Thumb r={r} />
                  {r.href ? <Link href={r.href} className="row-link" onClick={(e) => e.stopPropagation()}>{r.name}</Link> : <span>{r.name}</span>}
                  <b className="num">{vnd(r.priceVnd)}</b>
                </div>
                <div className="l2">
                  <span className={`pill ${r.condition === "like_new" || r.condition === "new" ? "pos" : r.condition === "for_parts" ? "warn" : ""}`}>{CONDITION_LABEL[r.condition]}</span>
                  <span className="faint">{[r.province, daysLabel(r.daysAgo), r.sample ? "tin mẫu" : null].filter(Boolean).join(" · ")}</span>
                  {fit.gain !== null && fit.gain > 0.005 && <span className="gain num">{signedPct(fit.gain)} điểm</span>}
                </div>
                {life && <div style={{ marginTop: 8 }}><LifeBar life={life} compact /></div>}
              </li>
            ))}
          </ul>
          <div className="table-wrap hide-sm">
            <table className="data market">
              <thead>
                <tr>
                  <th>Linh kiện</th>
                  <th className="r">Giá</th>
                  <th className="r hide-sm">Điểm / triệu</th>
                  <th className="r">Lắp vào máy {isSample ? "mẫu" : "bạn"}</th>
                  <th className="r">Kết thúc</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ r, fit, value, life }) => (
                  <tr key={r.id} className={[r.href ? "linked clickable" : "", life ? `life-${life.state}` : ""].join(" ").trim() || undefined}
                    onClick={() => r.href && router.push(r.href)}>
                    <td>
                     <div className="cell-thumb">
                      <Thumb r={r} />
                      <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {r.href ? <Link href={r.href} className="row-link" style={{ fontWeight: 500 }} onClick={(e) => e.stopPropagation()}>{r.name}</Link> : <span style={{ fontWeight: 500 }}>{r.name}</span>}
                        <span className={`pill ${r.condition === "like_new" || r.condition === "new" ? "pos" : r.condition === "for_parts" ? "warn" : ""}`}>{CONDITION_LABEL[r.condition]}</span>
                      </div>
                      <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>
                        {[r.province, r.seller, daysLabel(r.daysAgo), r.warrantyMonths ? `bảo hành ${r.warrantyMonths} tháng` : null, r.sample ? "tin mẫu" : r.inUse ? "đang dùng trong máy" : null].filter(Boolean).join(" · ")}
                        {r.verified !== null && <span className={`verify${r.verified ? " ok" : ""}`}>{r.verified ? "Xác thực đang dùng" : "Chưa xác thực"}</span>}
                      </div>
                      </div>
                     </div>
                    </td>
                    <td className="r num" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{vnd(r.priceVnd)}</td>
                    <td className="r num hide-sm">{value === null ? <span className="faint">—</span> : n0(value)}</td>
                    <td className="r num" style={{ whiteSpace: "nowrap" }}>
                      {fit.gain === null ? <span className="faint">{fit.note}</span>
                        : <span style={{ color: fit.gain > 0.005 ? "var(--positive)" : "var(--faint)", fontWeight: 500 }}>{signedPct(fit.gain)} điểm</span>}
                    </td>
                    <td className="r">{life ? <LifeBar life={life} /> : <span className="skeleton" style={{ display: "inline-block", width: 120, height: 32 }} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        <p className="faint" style={{ fontSize: 13, marginTop: 12 }}>
          “Lắp vào máy” tính theo cấu hình ở <Link href="/" className="card-link">Máy của tôi</Link>. Điểm / triệu: điểm linh kiện (card: sức mạnh game, CPU: gaming) chia cho giá.
        </p>
      </section>
    </>
  );
}
