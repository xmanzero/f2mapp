"use client";

import { findCpu, findGpu, resolveMachine, RESOLUTION_LABEL, TIERS } from "@f2m/shared";
import { Copy } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { n0, signedPct, vnd } from "@/lib/format";
import {
  CONDITION_LABEL, daysLabel, daysSince, DURATIONS, fitFor, KIND_LABEL, lifeOf, medianPrice, SAMPLE_ROWS, sampleListing, STATUS_LABEL, toRow, valueOf,
  type Listing, type ListingStatus, type MarketRow,
} from "@/lib/listings";
import { MAX_PHOTOS, photoUrl, shrinkImage, uploadPhoto } from "@/lib/photos";
import { useMachine } from "@/lib/use-machine";
import { useNow } from "@/lib/use-now";
import { LifeBar } from "./life-bar";
import { Gallery, PhotoPicker } from "./photos";

export function ListingDetail() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const photoFails = Number(params.get("loi-anh")) || 0;
  const [item, setItem] = useState<Listing | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [others, setOthers] = useState<MarketRow[]>([]);
  const { machine, isSample, ready } = useMachine();
  const now = useNow();

  useEffect(() => {
    if (!id) { setItem(null); setError("Thiếu mã tin"); return; }
    const sample = sampleListing(id, Date.now());
    if (sample) setItem(sample);
    else api<{ item: Listing }>(`/v1/listings/${id}`).then((r) => setItem(r.item)).catch((e: ApiError) => { setItem(null); setError(e.message); });
    api<{ items: Listing[] }>("/v1/listings?limit=200").then((r) => setOthers([...r.items.map(toRow), ...SAMPLE_ROWS])).catch(() => setOthers(SAMPLE_ROWS));
  }, [id]);

  const mine = useMemo(() => (ready ? resolveMachine(machine) : null), [ready, machine]);

  if (item === undefined) return <div className="title-row"><div><h1>Tin rao</h1><p className="sub">Đang tải…</p></div></div>;
  if (item === null)
    return (
      <>
        <div className="title-row"><div><h1>Tin rao</h1><p className="sub">{error}</p></div></div>
        <p className="empty">Tin có thể đã bán hoặc người bán đã ẩn. <Link href="/cho" className="card-link">Về chợ linh kiện</Link></p>
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
          <p className="crumb"><Link href="/cho" className="card-link">Chợ linh kiện</Link> · {KIND_LABEL[item.kind]}</p>
          <h1>{item.name}</h1>
          <p className="sub">
            {[CONDITION_LABEL[item.condition], item.province, `đăng ${daysLabel(daysSince(item.createdAt))}`].filter(Boolean).join(" · ")}
            {item.status !== "active" && <> · <b>{STATUS_LABEL[item.status]}</b></>}
          </p>
        </div>
        <span className="answer num">{vnd(item.priceVnd)}</span>
      </div>

      <div className="grid">
        <section className="panel s7" aria-labelledby="h-info">
          <header><h2 id="h-info">Thông tin</h2><span className="meta">Người bán: {item.seller.displayName} (@{item.seller.handle})</span></header>
          {item.sample && <p className="notice" style={{ marginTop: 0 }}>Đây là tin mẫu để minh họa chợ, không có người bán thật.</p>}
          {item.mine && photoFails > 0 && <p className="notice" style={{ marginTop: 0 }}>Tin đã đăng nhưng {photoFails} ảnh chưa gửi được. Thêm lại ở phần Quản lý tin bên dưới.</p>}
          <Gallery urls={item.photos.map(photoUrl)} name={item.name} />
          {now && <div className="life-row"><LifeBar life={lifeOf(new Date(item.createdAt).getTime(), new Date(item.expiresAt).getTime(), now)} /></div>}
          {item.source && (
            <div className="source">
              <div className="grow">
                <div style={{ fontWeight: 500 }}>{item.source.inUse ? "Đang dùng trong máy người bán" : "Đã thay ra khỏi máy người bán"}</div>
                <div className="line2">
                  Máy “{item.source.machineName}”{item.source.machine ? `: ${item.source.machine}` : ""}
                  {item.source.tier ? ` · hạng ${TIERS.find((t) => t.code === item.source!.tier)?.name ?? item.source.tier}` : ""}
                  {` · có trong máy từ ${new Date(item.source.installedAt).toLocaleDateString("vi-VN")}`}
                </div>
              </div>
              <span className={`pill ${item.source.verified ? "pos" : ""}`}
                title={item.source.verified ? "Phần mềm benchmark đã quét thấy linh kiện này đang dùng trong máy người bán" : "Người bán tự khai, chưa chạy phần mềm benchmark để xác nhận"}>
                {item.source.verified ? "Xác thực đang dùng" : "Chưa xác thực"}
              </span>
            </div>
          )}
          <dl className="rows">
            <div className="row"><dt className="grow muted">Tình trạng</dt><dd>{CONDITION_LABEL[item.condition]}</dd></div>
            <div className="row"><dt className="grow muted">Bảo hành</dt><dd>{item.warrantyMonths ? `${item.warrantyMonths} tháng` : "Không"}</dd></div>
            {gpu && <div className="row"><dt className="grow muted">Thông số</dt><dd className="num">{gpu.vramGb} GB VRAM · PCIe x{gpu.pcieLanes} · {gpu.boardPowerW} W · nguồn từ {gpu.psuRecommendedW} W</dd></div>}
            {cpu && <div className="row"><dt className="grow muted">Thông số</dt><dd className="num">{cpu.socket} · {cpu.powerW} W</dd></div>}
            <div className="row"><dt className="grow muted">Khu vực</dt><dd>{item.province ?? "—"}</dd></div>
          </dl>
          {item.description && <p className="desc">{item.description}</p>}
          <Contact item={item} />
          {item.mine && <OwnerTools item={item} onChange={setItem} />}
        </section>

        <section className="panel s5" aria-labelledby="h-worth">
          <header><h2 id="h-worth">Có đáng mua?</h2></header>
          {item.inCatalog ? (
            <ul className="rows">
              <li className="row">
                <div className="grow">
                  <div style={{ fontWeight: 500 }}>Lắp vào máy {isSample ? "mẫu" : "của bạn"}</div>
                  <div className="line2">
                    {fit.gain === null ? fit.note : fit.fpsBefore !== undefined && mine ? `Game ${RESOLUTION_LABEL[mine.resolution]}: ~${fit.fpsBefore} → ~${fit.fpsAfter} FPS` : ""}
                  </div>
                </div>
                {fit.gain !== null && <span className="num" style={{ fontSize: 20, fontWeight: 600, color: fit.gain > 0.005 ? "var(--positive)" : "var(--faint)" }}>{signedPct(fit.gain)}</span>}
              </li>
              <li className="row">
                <div className="grow">
                  <div style={{ fontWeight: 500 }}>Điểm trên mỗi triệu đồng</div>
                  <div className="line2">{item.kind === "gpu" ? "Sức mạnh game" : "Điểm gaming"} chia cho giá. Cao hơn là đáng tiền hơn.</div>
                </div>
                <span className="num" style={{ fontSize: 20, fontWeight: 600 }}>{value === null ? "—" : n0(value)}</span>
              </li>
              <li className="row">
                <div className="grow">
                  <div style={{ fontWeight: 500 }}>So với tin cùng linh kiện</div>
                  <div className="line2">{market ? `Giá giữa của ${market.count} tin khác: ${vnd(market.median)}` : "Chưa có tin nào khác để so."}</div>
                </div>
                {priceVsMarket !== null && <span className={`pill ${priceVsMarket <= -0.05 ? "pos" : priceVsMarket >= 0.1 ? "warn" : ""}`}>
                  {Math.abs(priceVsMarket) < 0.05 ? "Ngang giá" : priceVsMarket < 0 ? `Rẻ hơn ${Math.round(-priceVsMarket * 100)}%` : `Đắt hơn ${Math.round(priceVsMarket * 100)}%`}
                </span>}
              </li>
            </ul>
          ) : (
            <p className="empty">Linh kiện này chưa có trong danh mục điểm của f2m nên chưa so được điểm và giá.</p>
          )}
          {isSample && item.inCatalog && <p className="faint" style={{ fontSize: 13, marginTop: 12 }}>Đang so với máy mẫu. <Link href="/" className="card-link">Khai báo máy của bạn</Link> để thấy đúng mức tăng.</p>}
        </section>
      </div>
    </>
  );
}

function Contact({ item }: { item: Listing }) {
  const [copied, setCopied] = useState(false);
  if (item.mine) return null;
  if (item.sample) return <p className="contact"><span className="muted">Tin mẫu: không có số liên hệ.</span></p>;
  if (item.contactHidden)
    return <p className="contact"><span className="muted">Liên hệ người bán:</span> <Link href={`/dang-nhap?next=${encodeURIComponent(`/cho/tin?id=${item.id}`)}`} className="card-link">Đăng nhập để xem số</Link></p>;
  return (
    <p className="contact">
      <span className="muted">Liên hệ (Zalo / điện thoại):</span> <b className="num">{item.contact}</b>
      <button className="btn small" onClick={() => navigator.clipboard?.writeText(item.contact ?? "").then(() => setCopied(true)).catch(() => {})}>
        <Copy size={14} aria-hidden="true" /> {copied ? "Đã chép" : "Chép số"}
      </button>
    </p>
  );
}

function OwnerTools({ item, onChange }: { item: Listing; onChange: (l: Listing) => void }) {
  const [price, setPrice] = useState(String(item.priceVnd));
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
    ? [["reserved", "Đã có người hẹn"], ["sold", "Đã bán"], ["hidden", "Ẩn tin"]]
    : item.status === "reserved" ? [["active", "Hủy hẹn"], ["sold", "Đã bán"], ["hidden", "Ẩn tin"]]
    : item.status === "hidden" ? [["sold", "Đã bán"]]
    : [];
  return (
    <div className="owner">
      <h3>Quản lý tin của bạn</h3>
      <form className="owner-price" onSubmit={(e) => { e.preventDefault(); void patch({ priceVnd: Number(price.replace(/\D/g, "")) }, "Đã đổi giá"); }}>
        <label htmlFor="price" className="muted">Giá (₫)</label>
        <input id="price" className="input" inputMode="numeric" value={Number(price.replace(/\D/g, "") || 0).toLocaleString("vi-VN")}
          onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
        <button className="btn" disabled={busy}>Đổi giá</button>
      </form>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {actions.map(([s, label]) => <button key={s} className="btn small" disabled={busy} onClick={() => void patch({ status: s }, `Đã chuyển sang: ${STATUS_LABEL[s]}`)}>{label}</button>)}
      </div>
      {item.status !== "sold" && <OwnerPhotos item={item} onChange={onChange} />}
      {item.status !== "sold" && (
        <div className="owner-renew">
          <span className="muted">{live ? "Gia hạn thêm, tính từ bây giờ" : "Đăng lại trong"}</span>
          <div className="segmented wrap" role="group" aria-label="Thời gian bán">
            {DURATIONS.map((d) => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{d} ngày</button>)}
          </div>
          <button className="btn small primary" disabled={busy}
            onClick={() => void patch(live ? { durationDays: days } : { status: "active", durationDays: days }, live ? `Đã gia hạn ${days} ngày` : `Đã đăng lại, bán trong ${days} ngày`)}>
            {live ? "Gia hạn" : "Đăng lại"}
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
