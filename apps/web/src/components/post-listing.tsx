"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { n0, vnd } from "@/lib/format";
import {
  CONDITION_LABEL, DURATIONS, endLabel, KIND_LABEL, medianPrice, SAMPLE_ROWS, toRow, valueOf,
  type Condition, type Listing, type MarketRow, type SellablePart,
} from "@/lib/listings";
import { MAX_PHOTOS, shrinkImage, uploadPhoto } from "@/lib/photos";
import { PROVINCES } from "@/lib/provinces";
import { useSession } from "@/lib/session";
import { useNow } from "@/lib/use-now";
import { Combo } from "./combo";
import { PhotoPicker } from "./photos";

const CONTACT_KEY = "f2m.contact";

export function PostListing() {
  const router = useRouter();
  const mpParam = useSearchParams().get("mp");
  const { user } = useSession();
  const [parts, setParts] = useState<SellablePart[] | null>(null);
  const [market, setMarket] = useState<MarketRow[]>(SAMPLE_ROWS);
  const [f, setF] = useState({ partId: "", price: "", condition: "used" as Condition, warranty: "0", province: "", contact: "", description: "", days: 7 });
  const now = useNow(60_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pics, setPics] = useState<{ key: string; src: string; blob: Blob }[]>([]);
  const [picError, setPicError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  /** đã bấm Đăng tin: từ đó hiện lỗi dưới từng ô bắt buộc */
  const [tried, setTried] = useState(false);
  useEffect(() => () => pics.forEach((p) => URL.revokeObjectURL(p.src)), []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const addPics = async (files: File[]) => {
    setPicError(null);
    for (const file of files) {
      try {
        const blob = await shrinkImage(file);
        setPics((x) => (x.length >= MAX_PHOTOS ? x : [...x, { key: `${Date.now()}-${Math.random()}`, src: URL.createObjectURL(blob), blob }]));
      } catch (e) { setPicError((e as Error).message); }
    }
  };
  const removePic = (key: string) => setPics((x) => { const p = x.find((y) => y.key === key); if (p) URL.revokeObjectURL(p.src); return x.filter((y) => y.key !== key); });
  const coverPic = (key: string) => setPics((x) => [...x.filter((y) => y.key === key), ...x.filter((y) => y.key !== key)]);

  // ô bắt buộc: lỗi của từng ô (null = hợp lệ)
  const errs = {
    part: part ? null : "Chọn một linh kiện để bán",
    price: price >= 10_000 ? null : price ? "Giá bán tối thiểu 10.000 ₫" : "Nhập giá bán",
    contact: f.contact.trim().length >= 6 ? null : f.contact.trim() ? "Số liên hệ cần ít nhất 6 ký tự" : "Nhập Zalo hoặc số điện thoại để người mua liên hệ",
  };
  const firstBad = (Object.keys(errs) as (keyof typeof errs)[]).find((k) => errs[k]);
  const show = (k: keyof typeof errs) => (tried ? errs[k] : null);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const submit = async () => {
    if (firstBad) {
      setTried(true);
      document.getElementById(firstBad === "part" ? "pick-part" : firstBad)?.focus();
      return;
    }
    setBusy(true); setError(null);
    try {
      const r = await api<{ item: Listing }>("/v1/listings", {
        body: {
          machinePartId: f.partId, priceVnd: price, condition: f.condition, warrantyMonths: Number(f.warranty) || 0,
          province: f.province || null, description: f.description || null, contact: f.contact, durationDays: f.days,
        },
      });
      try { localStorage.setItem(CONTACT_KEY, f.contact); } catch { /* bỏ qua */ }
      // tin đã đăng; gửi ảnh lần lượt (ảnh lỗi thì báo ở trang tin, thêm lại được ở đó)
      let failed = 0;
      for (const [i, p] of pics.entries()) {
        setStep(`Đang gửi ảnh ${i + 1}/${pics.length}…`);
        try { await uploadPhoto(r.item.id, p.blob); } catch { failed++; }
      }
      router.push(`/cho/tin?id=${r.item.id}${failed ? `&loi-anh=${failed}` : ""}`);
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
            <form className="form" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              <p className="hint" style={{ margin: 0 }}>Ô có dấu <span className="req">*</span> là bắt buộc.</p>
              <fieldset className="pick" id="pick-part" tabIndex={-1} aria-invalid={!!show("part")} aria-describedby={show("part") ? "part-err" : undefined}>
                <legend className="sr-only">Chọn linh kiện (bắt buộc)</legend>
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
              {show("part") && <p id="part-err" className="field-error" role="alert">{show("part")}</p>}
              {part?.inUse && <p className="notice" style={{ margin: 0 }}>Linh kiện này đang lắp trong máy. Bán xong, pcdex sẽ nhắc bạn khai linh kiện thay thế.</p>}

              <div className="row2">
                <div className="field">
                  <label htmlFor="price">Giá bán (₫) <span className="req" aria-hidden="true">*</span></label>
                  <input id="price" className="input num" inputMode="numeric" required aria-required="true" aria-invalid={!!show("price")} value={price ? price.toLocaleString("vi-VN") : ""}
                    onChange={(e) => set("price", e.target.value.replace(/\D/g, "").slice(0, 9))} placeholder="Nhập giá bán"
                    aria-describedby={show("price") ? "price-err price-hint" : "price-hint"} />
                  {show("price") && <span id="price-err" className="field-error" role="alert">{show("price")}</span>}
                  <span id="price-hint" className="hint">
                    {ref ? <>Giá giữa của {ref.count} tin cùng linh kiện: {vnd(ref.median)}{!price && <> · <button type="button" className="link-btn" onClick={() => set("price", String(ref.median))}>Dùng giá này</button></>}</> : "Từ 10.000 ₫"}
                  </span>
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
                  <Combo id="province" value={f.province} onChange={(v) => set("province", v)} placeholder="Gõ tỉnh, VD: ha noi"
                    options={[{ value: "", label: "Chưa chọn" }, ...PROVINCES.map((p) => ({ value: p, label: p }))]} />
                </div>
              </div>
              <div className="field">
                <span className="label-like" id="days-label">Thời gian bán</span>
                <div className="segmented wrap" role="group" aria-labelledby="days-label" aria-describedby="days-hint">
                  {DURATIONS.map((d) => <button key={d} type="button" aria-pressed={f.days === d} onClick={() => set("days", d)}>{d} ngày</button>)}
                </div>
                <span id="days-hint" className="hint">
                  {now ? `Tin tự hủy lúc ${endLabel(now + f.days * 86_400_000)}. ` : ""}Hết hạn mà chưa bán thì linh kiện về lại kho, bạn đăng lại được.
                </span>
              </div>
              <div className="field">
                <label htmlFor="contact">Zalo / số điện thoại liên hệ <span className="req" aria-hidden="true">*</span></label>
                <input id="contact" className="input" type="tel" inputMode="tel" autoComplete="tel" required aria-required="true" aria-invalid={!!show("contact")} minLength={6} maxLength={60}
                  value={f.contact} onChange={(e) => set("contact", e.target.value)} aria-describedby={show("contact") ? "contact-err contact-hint" : "contact-hint"} />
                {show("contact") && <span id="contact-err" className="field-error" role="alert">{show("contact")}</span>}
                <span id="contact-hint" className="hint">Chỉ người đã đăng nhập mới thấy số này.</span>
              </div>
              <div className="field">
                <label htmlFor="desc">Mô tả</label>
                <textarea id="desc" className="input" maxLength={1000} value={f.description} onChange={(e) => set("description", e.target.value)}
                  placeholder="Thời gian dùng, đã sửa chưa, có hộp không, giao hàng hay gặp trực tiếp…" />
              </div>
              <PhotoPicker items={pics} onAdd={(fs) => void addPics(fs)} onRemove={removePic} onCover={coverPic} disabled={busy} error={picError} />
              {error && <p className="form-error" role="alert" style={{ marginTop: 0 }}>{error}</p>}
              <button className="btn primary block" disabled={busy}>{busy ? (step ?? "Đang đăng…") : "Đăng tin"}</button>
              {tried && firstBad && <p className="field-error" style={{ margin: 0, textAlign: "center" }}>Điền đủ các ô bắt buộc được đánh dấu đỏ ở trên.</p>}
            </form>
          )}
        </section>

        <section className="panel s5" aria-labelledby="h-preview">
          <header><h2 id="h-preview">Xem trước</h2><span className="meta">Người mua sẽ thấy</span></header>
          <div className="preview">
            {pics[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="preview-photo" src={pics[0].src} alt="Ảnh bìa" />
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ fontSize: 16 }}>{part?.label ?? "Chọn linh kiện"}</b>
              <span className={`pill ${f.condition === "like_new" || f.condition === "new" ? "pos" : f.condition === "for_parts" ? "warn" : ""}`}>{CONDITION_LABEL[f.condition]}</span>
            </div>
            <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>
              {[f.province || null, `@${user.handle}`, "hôm nay", Number(f.warranty) ? `bảo hành ${f.warranty} tháng` : null, `bán trong ${f.days} ngày`].filter(Boolean).join(" · ")}
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
                <div className="line2">Chạy phần mềm <a href="/tai/pcdex-scan.exe" download className="card-link">pcdex-scan</a> trên máy: linh kiện nào phần mềm quét thấy đang dùng sẽ có nhãn này.</div></div>
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
