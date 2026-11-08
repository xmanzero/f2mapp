"use client";

import { useI18n } from "@/i18n/client";

import { localizePartLabel, resolveMachine } from "@f2m/shared";
import { X } from "lucide-react";
import Link from "next/link";
import { Mascot } from "./mascot";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  fitFor, lifeOf, MIN_REAL_LISTINGS, rowTimes, SAMPLE_ROWS, toRow, valueOf,
  type Listing, type ListingKind, type MarketRow,
} from "@/lib/listings";
import { useSession } from "@/lib/session";
import { useMachine } from "@/lib/use-machine";
import { useNow } from "@/lib/use-now";
import { photoUrl } from "@/lib/photos";
import { PROVINCES } from "@/lib/provinces";
import { ALL, useMarketRegion } from "@/lib/region";
import { Combo } from "./combo";
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

/** `initial`: tin đang bán đã tải trên máy chủ (HTML có danh sách thật); trình duyệt vẫn tải lại bản mới */
export function Market({ initial }: { initial?: Listing[] } = {}) {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useSession();
  const { t, p, n0, signedPct, vnd, locale } = useI18n();
  const T = t.market, L = t.listing;
  const name = (s: string) => localizePartLabel(s, locale);
  const note = (s: string) => s.replace(/^Khác socket \((.+)\)$/, (_, x: string) => L.otherSocket(x));
  const [q, setQ] = useState(params.get("q") ?? "");
  const [kind, setKind] = useState<ListingKind | "all">("all");
  const [sort, setSort] = useState<Sort>("new");
  const [real, setReal] = useState<MarketRow[] | null>(initial?.length ? initial.map(toRow) : null);
  const { machine, isSample, ready } = useMachine();
  const now = useNow();
  const { region, setRegion, source } = useMarketRegion();

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
  const inRegion = (p: string | null) => !region || region === ALL || p === region;
  const scoped = rows.filter(({ r }) => (!q || r.name.toLowerCase().includes(q.toLowerCase())) && inRegion(r.province));
  // tỉnh có trong danh sách chọn: 34 tỉnh + tỉnh lạ có trong tin (dữ liệu cũ)
  const regionOptions: string[] = [...PROVINCES, ...new Set(rows.map(({ r }) => r.province).filter((p): p is string => !!p && !(PROVINCES as readonly string[]).includes(p)))];
  const regionCount = (p: string) => rows.filter(({ r }) => r.province === p).length;
  const shown = scoped
    .filter(({ r }) => kind === "all" || r.kind === kind)
    .sort((a, b) =>
      sort === "new" ? (b.life?.created ?? 0) - (a.life?.created ?? 0) || Number(a.r.sample) - Number(b.r.sample)
      : sort === "ending" ? (a.life?.expires ?? 0) - (b.life?.expires ?? 0)
      // điểm card và điểm CPU không so được với nhau: nhóm theo loại rồi mới xếp
      : sort === "value" ? KIND_ORDER[a.r.kind] - KIND_ORDER[b.r.kind] || (b.value ?? -1) - (a.value ?? -1)
      : (b.fit.gain ?? -9) - (a.fit.gain ?? -9));

  // Phát hiện: tin tăng điểm máy bạn nhiều nhất trên mỗi triệu đồng
  const best = mine && rows.filter(({ r }) => inRegion(r.province)).filter((x) => (x.fit.gain ?? 0) > 0.02)
    .sort((a, b) => b.fit.gain! / b.r.priceVnd - a.fit.gain! / a.r.priceVnd)[0];
  const realCount = real?.length ?? 0;
  const postHref = user ? p("/cho/dang-tin") : `${p("/dang-nhap")}?next=/cho/dang-tin`;

  return (
    <>
      <div className="title-row">
        <div>
          <h1>{t.nav.market}</h1>
          <p className="sub">
            {best ? T.best(isSample, name(best.r.name), vnd(best.r.priceVnd), Math.round(best.fit.gain! * 100)) : T.intro}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {user && <Link href={p("/cho/cua-toi")} className="btn">{t.pages.myListings}</Link>}
          <Link href={postHref} className="btn primary">{t.pages.postListing}</Link>
        </div>
      </div>

      <div className="counts" role="group" aria-label={T.filterKind}>
        {KINDS.map((k) => (
          <button key={k} className="count" aria-pressed={kind === k} onClick={() => setKind(k)}>
            <span className="label">{k === "all" ? T.all : L.kind[k]}</span>
            <span className="value num">{scoped.filter(({ r }) => k === "all" || r.kind === k).length}</span>
          </button>
        ))}
      </div>

      <section className="panel" aria-labelledby="h-list">
        <header>
          <h2 id="h-list">{T.count(kind === "all" ? T.all : L.kind[kind]!, <span className="num">{shown.length}</span>, region && region !== ALL ? region : null)}</h2>
          <span className="meta">{real === null ? t.common.loading : T.realCount(realCount, realCount < MIN_REAL_LISTINGS)}</span>
        </header>
        <div className="toolbar">
          <div className="segmented wrap" role="group" aria-label={T.sort}>
            {(["new", "ending", "value", "gain"] as const).map((k) => (
              <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{T.sorts[k]}</button>
            ))}
          </div>
          <div className="region">
            <label htmlFor="region" className="muted">{T.region}</label>
            <Combo id="region" value={region ?? ALL} onChange={setRegion} disabled={region === null} placeholder={T.regionPh}
              options={[{ value: ALL, label: T.nationwide, hint: String(rows.length) },
                ...regionOptions.map((p) => ({ value: p, label: p, hint: regionCount(p) ? String(regionCount(p)) : undefined }))]} />
            {(source === "home" || source === "last_listing") && region !== ALL && (
              <span id="region-why" className="faint" style={{ fontSize: 12 }}>{source === "home" ? T.byHome : T.byLast}</span>
            )}
          </div>
          <span className="spacer" />
          {q && (
            <button className="btn small" onClick={() => { setQ(""); router.replace(p("/cho")); }}>
              {T.searching(q)} <X size={14} aria-hidden="true" /><span className="sr-only">{T.clearSearch}</span>
            </button>
          )}
        </div>

        {real === null ? (
          <div aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 52, marginTop: 8 }} />)}</div>
        ) : shown.length === 0 ? (
          <div className="empty-state inline">
            <Mascot size={88} />
            <p>
              {q ? T.noMatch(q, kind !== "all") : T.noneInKind}{region && region !== ALL ? T.inRegion(region) : ""}.{" "}
              {region && region !== ALL ? <button type="button" className="link-btn" onClick={() => setRegion(ALL)}>{T.seeNationwide}</button> : <Link href={postHref} className="card-link">{t.pages.postListing}</Link>}
            </p>
          </div>
        ) : (
          <>
          {/* điện thoại: danh sách dòng hai tầng thay cho bảng */}
          <ul className="mlist show-sm-block" aria-label={T.listings}>
            {shown.map(({ r, fit, life }) => (
              <li key={r.id} className={[r.href ? "linked clickable" : "", life ? `life-${life.state}` : ""].join(" ").trim() || undefined}
                onClick={() => r.href && router.push(p(r.href))}>
                <div className="l1">
                  <Thumb r={r} />
                  {r.href ? <Link href={p(r.href)} className="row-link" onClick={(e) => e.stopPropagation()}>{name(r.name)}</Link> : <span>{name(r.name)}</span>}
                  <b className="num">{vnd(r.priceVnd)}</b>
                </div>
                <div className="l2">
                  <span className={`pill ${r.condition === "like_new" || r.condition === "new" ? "pos" : r.condition === "for_parts" ? "warn" : ""}`}>{L.condition[r.condition]}</span>
                  <span className="faint">{[r.province, L.daysAgo(r.daysAgo), r.sample ? T.sample : null].filter(Boolean).join(" · ")}</span>
                  {fit.gain !== null && fit.gain > 0.005 && <span className="gain num">{signedPct(fit.gain)} {t.machine.points}</span>}
                </div>
                {life && <div style={{ marginTop: 8 }}><LifeBar life={life} compact /></div>}
              </li>
            ))}
          </ul>
          <div className="table-wrap hide-sm">
            <table className="data market">
              <thead>
                <tr>
                  <th>{T.colPart}</th>
                  <th className="r">{T.colPrice}</th>
                  <th className="r hide-sm">{T.colValue}</th>
                  <th className="r">{T.colFit(isSample)}</th>
                  <th className="r">{T.colEnds}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ r, fit, value, life }) => (
                  <tr key={r.id} className={[r.href ? "linked clickable" : "", life ? `life-${life.state}` : ""].join(" ").trim() || undefined}
                    onClick={() => r.href && router.push(p(r.href))}>
                    <td>
                     <div className="cell-thumb">
                      <Thumb r={r} />
                      <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {r.href ? <Link href={p(r.href)} className="row-link" style={{ fontWeight: 500 }} onClick={(e) => e.stopPropagation()}>{name(r.name)}</Link> : <span style={{ fontWeight: 500 }}>{name(r.name)}</span>}
                        <span className={`pill ${r.condition === "like_new" || r.condition === "new" ? "pos" : r.condition === "for_parts" ? "warn" : ""}`}>{L.condition[r.condition]}</span>
                      </div>
                      <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>
                        {[r.province, r.seller, L.daysAgo(r.daysAgo), r.warrantyMonths ? T.warranty(r.warrantyMonths) : null, r.sample ? T.sample : r.inUse ? T.inUse : null].filter(Boolean).join(" · ")}
                        {r.verified !== null && <span className={`verify${r.verified ? " ok" : ""}`}>{r.verified ? t.machine.verified : t.machine.unverified}</span>}
                      </div>
                      </div>
                     </div>
                    </td>
                    <td className="r num" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{vnd(r.priceVnd)}</td>
                    <td className="r num hide-sm">{value === null ? <span className="faint">—</span> : n0(value)}</td>
                    <td className="r num" style={{ whiteSpace: "nowrap" }}>
                      {fit.gain === null ? <span className="faint">{note(fit.note)}</span>
                        : <span style={{ color: fit.gain > 0.005 ? "var(--positive)" : "var(--faint)", fontWeight: 500 }}>{signedPct(fit.gain)} {t.machine.points}</span>}
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
          {T.footnote(<Link href={p("/may")} className="card-link">{t.nav.machine}</Link>)}
        </p>
      </section>
    </>
  );
}
