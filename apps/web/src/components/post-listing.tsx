"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { n0, vnd } from "@/lib/format";
import {
  CONDITION_LABEL, KIND_LABEL, medianPrice, SAMPLE_ROWS, toRow, valueOf,
  type Condition, type Listing, type MarketRow, type SellablePart,
} from "@/lib/listings";
import { PROVINCES } from "@/lib/provinces";
import { useSession } from "@/lib/session";

const CONTACT_KEY = "f2m.contact";

export function PostListing() {
  const router = useRouter();
  const mpParam = useSearchParams().get("mp");
  const { user } = useSession();
  const [parts, setParts] = useState<SellablePart[] | null>(null);
  const [market, setMarket] = useState<MarketRow[]>(SAMPLE_ROWS);
  const [f, setF] = useState({ partId: "", price: "", condition: "used" as Condition, warranty: "0", province: "", contact: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let contact = "";
    try { contact = localStorage.getItem(CONTACT_KEY) ?? ""; } catch { /* bỏ qua */ }
    setF((x) => ({ ...x, province: x.province || user.province || "", contact: x.contact || contact }));
    api<{ parts: SellablePart[] }>("/v1/me/listings").then((r) => {
      setParts(r.parts);
      const free = r.parts.filter((p) => !p.listingId);
      const pick = free.find((p) => p.id === mpParam) ?? free.find((p) => !p.inUse) ?? free[0];
      if (pick) setF((x) => ({ ...x, partId: pick.id }));
    }).catch(() => setParts([]));
    api<{ items: Listing[] }>("/v1/listings?limit=200").then((r) => setMarket([...r.items.map(toRow), ...SAMPLE_ROWS])).catch(() => {});
  }, [user, mpParam]);

  const part = parts?.find((p) => p.id === f.partId) ?? null;
  const catalog = part && (part.kind === "cpu" || part.kind === "gpu") ? part.label : null;
  const price = Number(f.price.replace(/\D/g, "")) || 0;
  const ref = useMemo(() => (part ? medianPrice(market, catalog ?? part.label) : null), [market, part, catalog]);
  const value = part && catalog && price > 0 ? valueOf(part.kind, catalog, price) : null;
  // nhóm theo máy
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; primary: boolean; items: SellablePart[] }>();
    for (const p of parts ?? []) {
      if (!m.has(p.machineId)) m.set(p.machineId, { name: p.machineName, primary: p.isPrimary, items: [] });
      m.get(p.machineId)!.items.push(p);
    }
    return [...m.values()];
  }, [parts]);

  if (user === undefined) return <div className="title-row"><div><h1>Đăng tin bán</h1><p className="sub">Đang tải…</p></div></div>;
  if (user === null)
    return (
      <>
        <div className="title-row"><div><h1>Đăng tin bán</h1><p className="sub">Cần đăng nhập để đăng tin.</p></div></div>
        <p className="empty"><Link href="/dang-nhap?next=/cho/dang-tin" className="card-link">Đăng nhập hoặc tạo tài khoản</Link> để đăng tin bán linh kiện.</p>
      </>
    );

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<{ item: Listing }>("/v1/listings", {
        body: {
          machinePartId: f.partId, priceVnd: price, condition: f.condition, warrantyMonths: Number(f.warranty) || 0,
          province: f.province || null, description: f.description || null, contact: f.contact,
        },
      });
      try { localStorage.setItem(CONTACT_KEY, f.contact); } catch { /* bỏ qua */ }
      router.push(`/cho/tin?id=${r.item.id}`);
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="title-row">
        <div>
          <p className="crumb"><Link href="/cho" className="card-link">Chợ linh kiện</Link></p>
          <h1>Đăng tin bán</h1>
          <p className="sub">Chọn linh kiện trong máy của bạn. Mỗi ngày đăng tối đa 5 tin.</p>
        </div>
      </div>

      <div className="grid">
        <section className="panel s7" aria-labelledby="h-form">
          <header><h2 id="h-form">Linh kiện bán</h2><Link href="/" className="card-link" style={{ fontSize: 13 }}>Sửa cấu hình máy</Link></header>
          {parts === null ? (
            <div className="skeleton" style={{ height: 160 }} aria-busy="true" />
          ) : parts.length === 0 ? (
            <p className="empty">Bạn chưa khai báo máy. Chỉ bán được linh kiện có trong máy của mình. <Link href="/" className="card-link">Khai báo ở Máy của tôi</Link></p>
          ) : (
            <form className="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              <fieldset className="pick">
                <legend className="sr-only">Chọn linh kiện</legend>
                {groups.map((g) => (
                  <div key={g.name} className="pick-group">
                    <p className="pick-machine">{g.name}{g.primary && groups.length > 1 ? " (máy chính)" : ""}</p>
                    {g.items.map((p) => (
                      <label key={p.id} className={`pick-item${p.listingId ? " taken" : ""}`}>
                        <input type="radio" name="part" value={p.id} checked={f.partId === p.id} disabled={!!p.listingId} onChange={() => set("partId", p.id)} />
                        <span className="grow">
                          <span className="pick-name">{p.label}</span>
                          <span className="line2">{KIND_LABEL[p.kind]} · {p.listingId ? "đang có tin bán" : p.inUse ? "đang lắp trong máy" : "đã thay ra"}</span>
                        </span>
                        <span className={`pill ${p.verified ? "pos" : ""}`}>{p.verified ? "Xác thực đang dùng" : "Chưa xác thực"}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </fieldset>
              {part?.inUse && <p className="notice" style={{ margin: 0 }}>Linh kiện này đang lắp trong máy. Bán xong, f2m sẽ nhắc bạn khai linh kiện thay thế.</p>}

              <div className="row2">
                <div className="field">
                  <label htmlFor="price">Giá bán (₫)</label>
                  <input id="price" className="input num" inputMode="numeric" required value={price ? price.toLocaleString("vi-VN") : ""}
                    onChange={(e) => set("price", e.target.value.replace(/\D/g, "").slice(0, 9))} placeholder={ref ? ref.median.toLocaleString("vi-VN") : "4.300.000"}
                    aria-describedby="price-hint" />
                  <span id="price-hint" className="hint">{ref ? `Giá giữa của ${ref.count} tin cùng linh kiện: ${vnd(ref.median)}` : "Từ 10.000 ₫"}</span>
                </div>
                <div className="field">
                  <label htmlFor="condition">Tình trạng</label>
                  <select id="condition" className="input" value={f.condition} onChange={(e) => set("condition", e.target.value as Condition)}>
                    {(Object.keys(CONDITION_LABEL) as Condition[]).map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
                  </select>
                </div>
              </div>
              <div className="row2">
                <div className="field">
                  <label htmlFor="warranty">Bảo hành còn (tháng)</label>
                  <input id="warranty" className="input num" inputMode="numeric" value={f.warranty} onChange={(e) => set("warranty", e.target.value.replace(/\D/g, "").slice(0, 2))} />
                </div>
                <div className="field">
                  <label htmlFor="province">Khu vực</label>
                  <select id="province" className="input" value={f.province} onChange={(e) => set("province", e.target.value)}>
                    <option value="">Chưa chọn</option>
                    {PROVINCES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="contact">Zalo / số điện thoại liên hệ</label>
                <input id="contact" className="input" type="tel" inputMode="tel" autoComplete="tel" required minLength={6} maxLength={60}
                  value={f.contact} onChange={(e) => set("contact", e.target.value)} aria-describedby="contact-hint" />
                <span id="contact-hint" className="hint">Chỉ người đã đăng nhập mới thấy số này.</span>
              </div>
              <div className="field">
                <label htmlFor="desc">Mô tả</label>
                <textarea id="desc" className="input" maxLength={1000} value={f.description} onChange={(e) => set("description", e.target.value)}
                  placeholder="Thời gian dùng, đã sửa chưa, có hộp không, giao hàng hay gặp trực tiếp…" />
              </div>
              {error && <p className="form-error" role="alert" style={{ marginTop: 0 }}>{error}</p>}
              <button className="btn primary block" disabled={busy || !part || price < 10_000}>{busy ? "Đang đăng…" : "Đăng tin"}</button>
            </form>
          )}
        </section>

        <section className="panel s5" aria-labelledby="h-preview">
          <header><h2 id="h-preview">Xem trước</h2><span className="meta">Người mua sẽ thấy</span></header>
          <div className="preview">
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ fontSize: 16 }}>{part?.label ?? "Chọn linh kiện"}</b>
              <span className={`pill ${f.condition === "like_new" || f.condition === "new" ? "pos" : f.condition === "for_parts" ? "warn" : ""}`}>{CONDITION_LABEL[f.condition]}</span>
            </div>
            <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>
              {[f.province || null, `@${user.handle}`, "hôm nay", Number(f.warranty) ? `bảo hành ${f.warranty} tháng` : null].filter(Boolean).join(" · ")}
            </div>
            {part && <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>Từ máy “{part.machineName}” · {part.inUse ? "đang dùng" : "đã thay ra"} · <span style={{ color: part.verified ? "var(--positive)" : undefined }}>{part.verified ? "xác thực đang dùng" : "chưa xác thực"}</span></div>}
            <div className="answer num" style={{ marginTop: 12 }}>{price ? vnd(price) : "— ₫"}</div>
          </div>
          <ul className="rows" style={{ marginTop: 8 }}>
            <li className="row">
              <div className="grow"><div style={{ fontWeight: 500 }}>Điểm trên mỗi triệu đồng</div><div className="line2">{catalog ? "Người mua dùng số này để so tin đáng tiền." : "Chỉ tính cho card và CPU."}</div></div>
              <span className="num" style={{ fontSize: 20, fontWeight: 600 }}>{value === null ? "—" : n0(value)}</span>
            </li>
            <li className="row">
              <div className="grow"><div style={{ fontWeight: 500 }}>So với tin cùng linh kiện</div>
                <div className="line2">{ref ? `Giá giữa ${vnd(ref.median)} (${ref.count} tin)` : "Chưa có tin nào khác để so."}</div></div>
              {ref && price > 0 && (() => {
                const d = price / ref.median - 1;
                return <span className={`pill ${d <= -0.05 ? "pos" : d >= 0.1 ? "warn" : ""}`}>{Math.abs(d) < 0.05 ? "Ngang giá" : d < 0 ? `Rẻ hơn ${Math.round(-d * 100)}%` : `Đắt hơn ${Math.round(d * 100)}%`}</span>;
              })()}
            </li>
            <li className="row">
              <div className="grow"><div style={{ fontWeight: 500 }}>Muốn có nhãn “Xác thực đang dùng”?</div>
                <div className="line2">Chạy phần mềm benchmark của f2m trên máy: linh kiện nào phần mềm quét thấy đang dùng sẽ có nhãn này (sắp có).</div></div>
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
