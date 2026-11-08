"use client";

import { useI18n } from "@/i18n/client";
import { machineName } from "@/lib/use-machine";

import { findCpu, findGpu, localizePartLabel, resolveMachine, RESOLUTION_LABEL, TIERS, tierName } from "@f2m/shared";
import { Copy } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import {
  daysSince, DURATIONS, fitFor, lifeOf, medianPrice, SAMPLE_ROWS, sampleListing, toRow, valueOf,
  type Listing, type ListingStatus, type MarketRow,
} from "@/lib/listings";
import { MAX_PHOTOS, photoUrl, shrinkImage, uploadPhoto } from "@/lib/photos";
import { useMachine } from "@/lib/use-machine";
import { useNow } from "@/lib/use-now";
import { LifeBar } from "./life-bar";
import { Gallery, PhotoPicker } from "./photos";

/**
 * Trang tin rao. Trang /cho/<tên>-<id> truyền sẵn tin đã tải trên máy chủ (`initial`) để HTML có nội dung ngay;
 * trình duyệt tải lại để có phần riêng của người xem (số liên hệ khi đã đăng nhập, công cụ của người bán).
 * Trang /cho/tin?id=… (tin mẫu) đọc id trên địa chỉ.
 */
export function ListingDetail({ initial }: { initial?: Listing } = {}) {
  const params = useSearchParams();
  const id = initial?.id ?? params.get("id") ?? "";
  const photoFails = Number(params.get("loi-anh")) || 0;
  const [item, setItem] = useState<Listing | null | undefined>(initial);
  const [error, setError] = useState<string | null>(null);
  const [others, setOthers] = useState<MarketRow[]>([]);
  const { machine, isSample, ready } = useMachine();
  const now = useNow();
  const { t, p, n0, signedPct, vnd, date, locale } = useI18n();
  const T = t.detail, L = t.listing;

  useEffect(() => {
    if (!id) { setItem(null); setError(T.missingId); return; }
    const sample = sampleListing(id, Date.now());
    if (sample) setItem(sample);
    else api<{ item: Listing }>(`/v1/listings/${id}`).then((r) => setItem(r.item)).catch((e: ApiError) => { setItem(null); setError(e.message); });
    api<{ items: Listing[] }>("/v1/listings?limit=200").then((r) => setOthers([...r.items.map(toRow), ...SAMPLE_ROWS])).catch(() => setOthers(SAMPLE_ROWS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const mine = useMemo(() => (ready ? resolveMachine(machine) : null), [ready, machine]);

  if (item === undefined) return <div className="title-row"><div><h1>{t.pages.listing}</h1><p className="sub">{t.common.loading}</p></div></div>;
  if (item === null)
    return (
      <>
        <div className="title-row"><div><h1>{t.pages.listing}</h1><p className="sub">{error}</p></div></div>
        <p className="empty">{T.gone} <Link href={p("/cho")} className="card-link">{T.backToMarket}</Link></p>
      </>
    );

  const fit = fitFor(item.kind, item.partName, mine);
  const value = valueOf(item.kind, item.partName, item.priceVnd);
  const market = item.partName ? medianPrice(others, item.partName, item.id) : null;
  const gpu = item.kind === "gpu" && item.partName ? findGpu(item.partName) : undefined;
  const cpu = item.kind === "cpu" && item.partName ? findCpu(item.partName) : undefined;
  const priceVsMarket = market ? item.priceVnd / market.median - 1 : null;

  return (
    <>
      <div className="title-row">
        <div>
          <p className="crumb"><Link href={p("/cho")} className="card-link">{t.nav.market}</Link> · {L.kind[item.kind]}</p>
          <h1>{localizePartLabel(item.name, locale)}</h1>
          <p className="sub">
            {[L.condition[item.condition], item.province, T.posted(L.daysAgo(daysSince(item.createdAt)))].filter(Boolean).join(" · ")}
            {item.status !== "active" && <> · <b>{L.status[item.status]}</b></>}
          </p>
        </div>
        <span className="answer num">{vnd(item.priceVnd)}</span>
      </div>

      <div className="grid">
        <section className="panel s7" aria-labelledby="h-info">
          <header><h2 id="h-info">{T.info}</h2><span className="meta">{T.seller(item.seller.displayName, item.seller.handle)}</span></header>
          {item.sample && <p className="notice" style={{ marginTop: 0 }}>{T.sampleNotice}</p>}
          {item.mine && photoFails > 0 && <p className="notice" style={{ marginTop: 0 }}>{T.photoFails(photoFails)}</p>}
          <Gallery urls={item.photos.map(photoUrl)} name={localizePartLabel(item.name, locale)} />
          {now && <div className="life-row"><LifeBar life={lifeOf(new Date(item.createdAt).getTime(), new Date(item.expiresAt).getTime(), now)} /></div>}
          {item.source && (
            <div className="source">
              <div className="grow">
                <div style={{ fontWeight: 500 }}>{item.source.inUse ? T.inUse : T.removed}</div>
                <div className="line2">
                  {T.machine(machineName(item.source.machineName, locale))}{item.source.machine ? `: ${item.source.machine}` : ""}
                  {item.source.tier ? T.tier(((x) => (x ? tierName(x, locale) : item.source!.tier!))(TIERS.find((x) => x.code === item.source!.tier))) : ""}
                  {T.since(date(item.source.installedAt))}
                </div>
              </div>
              <span className={`pill ${item.source.verified ? "pos" : ""}`}
                title={item.source.verified ? T.verifiedTip : T.unverifiedTip}>
                {item.source.verified ? t.machine.verified : t.machine.unverified}
              </span>
            </div>
          )}
          <dl className="rows">
            <div className="row"><dt className="grow muted">{T.condition}</dt><dd>{L.condition[item.condition]}</dd></div>
            <div className="row"><dt className="grow muted">{T.warranty}</dt><dd>{item.warrantyMonths ? T.months(item.warrantyMonths) : T.none}</dd></div>
            {gpu && <div className="row"><dt className="grow muted">{T.specs}</dt><dd className="num">{gpu.vramGb} GB VRAM · PCIe x{gpu.pcieLanes} · {gpu.boardPowerW} W · {T.psuFrom(gpu.psuRecommendedW)}</dd></div>}
            {cpu && <div className="row"><dt className="grow muted">{T.specs}</dt><dd className="num">{cpu.socket} · {cpu.powerW} W</dd></div>}
            <div className="row"><dt className="grow muted">{T.area}</dt><dd>{item.province ?? "—"}</dd></div>
          </dl>
          {item.description && <p className="desc">{item.description}</p>}
          <Contact item={item} />
          {item.mine && <OwnerTools item={item} onChange={setItem} />}
        </section>

        <section className="panel s5" aria-labelledby="h-worth">
          <header><h2 id="h-worth">{T.worth}</h2></header>
          {item.inCatalog ? (
            <ul className="rows">
              <li className="row">
                <div className="grow">
                  <div style={{ fontWeight: 500 }}>{T.fitTitle(isSample)}</div>
                  <div className="line2">
                    {fit.gain === null ? fit.note.replace(/^Khác socket \((.+)\)$/, (_, x: string) => L.otherSocket(x)) : fit.fpsBefore !== undefined && mine ? T.fitFps(RESOLUTION_LABEL[mine.resolution], fit.fpsBefore, fit.fpsAfter!) : ""}
                  </div>
                </div>
                {fit.gain !== null && <span className="num" style={{ fontSize: 20, fontWeight: 600, color: fit.gain > 0.005 ? "var(--positive)" : "var(--faint)" }}>{signedPct(fit.gain)}</span>}
              </li>
              <li className="row">
                <div className="grow">
                  <div style={{ fontWeight: 500 }}>{T.valueTitle}</div>
                  <div className="line2">{T.valueText(item.kind === "gpu")}</div>
                </div>
                <span className="num" style={{ fontSize: 20, fontWeight: 600 }}>{value === null ? "—" : n0(value)}</span>
              </li>
              <li className="row">
                <div className="grow">
                  <div style={{ fontWeight: 500 }}>{T.vsTitle}</div>
                  <div className="line2">{market ? T.vsText(market.count, vnd(market.median)) : T.vsNone}</div>
                </div>
                {priceVsMarket !== null && <span className={`pill ${priceVsMarket <= -0.05 ? "pos" : priceVsMarket >= 0.1 ? "warn" : ""}`}>
                  {Math.abs(priceVsMarket) < 0.05 ? T.same : priceVsMarket < 0 ? T.cheaper(Math.round(-priceVsMarket * 100)) : T.pricier(Math.round(priceVsMarket * 100))}
                </span>}
              </li>
            </ul>
          ) : (
            <p className="empty">{T.notInCatalog}</p>
          )}
          {isSample && item.inCatalog && <p className="faint" style={{ fontSize: 13, marginTop: 12 }}>{T.vsSample(<Link href={p("/may")} className="card-link">{T.declare}</Link>)}</p>}
        </section>
      </div>
    </>
  );
}

function Contact({ item }: { item: Listing }) {
  const [copied, setCopied] = useState(false);
  const { t, p } = useI18n();
  const T = t.detail;
  if (item.mine) return null;
  if (item.sample) return <p className="contact"><span className="muted">{T.sampleContact}</span></p>;
  if (item.contactHidden)
    return <p className="contact"><span className="muted">{T.contactSeller}</span> <Link href={`${p("/dang-nhap")}?next=${encodeURIComponent(`/cho/tin?id=${item.id}`)}`} className="card-link">{T.loginToSee}</Link></p>;
  return (
    <p className="contact">
      <span className="muted">{T.contact}</span> <b className="num">{item.contact}</b>
      <button className="btn small" onClick={() => navigator.clipboard?.writeText(item.contact ?? "").then(() => setCopied(true)).catch(() => {})}>
        <Copy size={14} aria-hidden="true" /> {copied ? T.copied : T.copy}
      </button>
    </p>
  );
}

function OwnerTools({ item, onChange }: { item: Listing; onChange: (l: Listing) => void }) {
  const [price, setPrice] = useState(String(item.priceVnd));
  const { t, n0 } = useI18n();
  const T = t.detail;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const patch = async (body: object, done: string) => {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ item: Listing }>(`/v1/listings/${item.id}`, { method: "PATCH", body });
      onChange(r.item); setMsg(done);
    } catch (e) { setMsg((e as ApiError).message); } finally { setBusy(false); }
  };
  const [days, setDays] = useState<number>(7);
  const live = item.status === "active" || item.status === "reserved";
  const actions: [ListingStatus, string][] = item.status === "active"
    ? [["reserved", T.actReserved], ["sold", T.actSold], ["hidden", T.actHide]]
    : item.status === "reserved" ? [["active", T.actUnreserve], ["sold", T.actSold], ["hidden", T.actHide]]
    : item.status === "hidden" ? [["sold", T.actSold]]
    : [];
  return (
    <div className="owner">
      <h3>{T.manage}</h3>
      <form className="owner-price" onSubmit={(e) => { e.preventDefault(); void patch({ priceVnd: Number(price.replace(/\D/g, "")) }, T.priceChanged); }}>
        <label htmlFor="price" className="muted">{T.price}</label>
        <input id="price" className="input" inputMode="numeric" value={n0(Number(price.replace(/\D/g, "") || 0))}
          onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
        <button className="btn" disabled={busy}>{T.changePrice}</button>
      </form>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {actions.map(([s, label]) => <button key={s} className="btn small" disabled={busy} onClick={() => void patch({ status: s }, T.movedTo(t.listing.status[s]!))}>{label}</button>)}
      </div>
      {item.status !== "sold" && <OwnerPhotos item={item} onChange={onChange} />}
      {item.status !== "sold" && (
        <div className="owner-renew">
          <span className="muted">{live ? T.extend : T.relist}</span>
          <div className="segmented wrap" role="group" aria-label={T.duration}>
            {DURATIONS.map((d) => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{t.common.days(d)}</button>)}
          </div>
          <button className="btn small primary" disabled={busy}
            onClick={() => void patch(live ? { durationDays: days } : { status: "active", durationDays: days }, live ? T.extended(days) : T.relisted(days))}>
            {live ? T.extendBtn : T.relistBtn}
          </button>
        </div>
      )}
      {msg && <p className="stamp" role="status">{msg}</p>}
    </div>
  );
}

/** Người bán thêm / bỏ / đổi ảnh bìa của tin đã đăng */
function OwnerPhotos({ item, onChange }: { item: Listing; onChange: (l: Listing) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (f: () => Promise<Listing | void>) => {
    setBusy(true); setError(null);
    try { const l = await f(); if (l) onChange(l); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const add = (files: File[]) => run(async () => {
    let last: Listing | undefined;
    for (const file of files.slice(0, MAX_PHOTOS - item.photos.length)) last = await uploadPhoto(item.id, await shrinkImage(file));
    return last;
  });
  const remove = (pid: string) => run(async () => (await api<{ item: Listing }>(`/v1/listings/${item.id}/photos/${pid}`, { method: "DELETE" })).item);
  const cover = (pid: string) => run(async () => (await api<{ item: Listing }>(`/v1/listings/${item.id}/photos`,
    { method: "PUT", body: { order: [pid, ...item.photos.filter((x) => x !== pid)] } })).item);
  return (
    <PhotoPicker items={item.photos.map((pid) => ({ key: pid, src: photoUrl(pid) }))} onAdd={(fs) => void add(fs)}
      onRemove={(k) => void remove(k)} onCover={(k) => void cover(k)} disabled={busy} error={error} />
  );
}
