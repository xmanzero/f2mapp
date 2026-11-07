"use client";

import { CPUS, GPUS, SOCKET_MEMORY } from "@f2m/shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { n0, vnd } from "@/lib/format";
import {
  CONDITION_LABEL, KIND_LABEL, medianPrice, SAMPLE_ROWS, toRow, valueOf,
  type Condition, type Listing, type ListingKind, type MarketRow, type ReplacedPart,
} from "@/lib/listings";
import { PROVINCES } from "@/lib/provinces";
import { useSession } from "@/lib/session";

const CONTACT_KEY = "f2m.contact";
const KINDS: ListingKind[] = ["gpu", "cpu", "ram", "storage", "other"];
const TITLE_HINT: Partial<Record<ListingKind, string>> = {
  ram: "DDR4 16 GB (2×8 GB) 3200 MHz", storage: "SSD NVMe Gen3 512 GB", other: "Nguồn 650 W 80 Plus Bronze",
};

export function PostListing() {
  const router = useRouter();
  const mpParam = useSearchParams().get("mp");
  const { user } = useSession();
  const [replaced, setReplaced] = useState<ReplacedPart[]>([]);
  const [market, setMarket] = useState<MarketRow[]>(SAMPLE_ROWS);
  const [f, setF] = useState({
    kind: "gpu" as ListingKind, partName: GPUS.find((g) => !g.integrated)!.name, title: "", price: "",
    condition: "used" as Condition, warranty: "0", province: "", contact: "", description: "", machinePartId: "" as string,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let contact = "";
    try { contact = localStorage.getItem(CONTACT_KEY) ?? ""; } catch { /* bỏ qua */ }
    setF((x) => ({ ...x, province: x.province || user.province || "", contact: x.contact || contact }));
    api<{ replacedParts: ReplacedPart[] }>("/v1/me/listings").then((r) => {
      setReplaced(r.replacedParts);
      const pick = r.replacedParts.find((p) => p.id === mpParam);
      if (pick) setF((x) => ({ ...x, kind: pick.kind, partName: pick.name, machinePartId: pick.id }));
    }).catch(() => {});
    api<{ items: Listing[] }>("/v1/listings?limit=200").then((r) => setMarket([...r.items.map(toRow), ...SAMPLE_ROWS])).catch(() => {});
  }, [user, mpParam]);

  const price = Number(f.price.replace(/\D/g, "")) || 0;
  const catalog = f.kind === "gpu" || f.kind === "cpu";
  const name = catalog ? f.partName : f.title.trim();
  const ref = useMemo(() => (catalog ? medianPrice(market, f.partName) : null), [catalog, market, f.partName]);
  const value = catalog && price > 0 ? valueOf(f.kind, f.partName, price) : null;

  if (user === undefined) return <div className="title-row"><div><h1>Đăng tin bán</h1><p className="sub">Đang tải…</p></div></div>;
  if (user === null)
    return (
      <>
        <div className="title-row"><div><h1>Đăng tin bán</h1><p className="sub">Cần đăng nhập để đăng tin.</p></div></div>
        <p className="empty"><Link href="/dang-nhap?next=/cho/dang-tin" className="card-link">Đăng nhập hoặc tạo tài khoản</Link> để đăng tin bán linh kiện.</p>
      </>
    );

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const setKind = (k: ListingKind) => setF((x) => ({
    ...x, kind: k, machinePartId: "",
    partName: k === "gpu" ? GPUS.find((g) => !g.integrated)!.name : k === "cpu" ? CPUS[0]!.name : x.partName,
  }));
  const pickReplaced = (p: ReplacedPart) => setF((x) => ({ ...x, kind: p.kind, partName: p.name, machinePartId: p.id }));

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<{ item: Listing }>("/v1/listings", {
        body: {
          kind: f.kind, partName: catalog ? f.partName : undefined, title: catalog ? undefined : f.title,
          priceVnd: price, condition: f.condition, warrantyMonths: Number(f.warranty) || 0,
          province: f.province || null, description: f.description || null, contact: f.contact,
          machinePartId: f.machinePartId || undefined,
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
          <p className="sub">Card và CPU chọn trong danh mục để người mua thấy ngay điểm và mức tăng khi lắp vào máy họ.</p>
        </div>
      </div>

      <div className="grid">
        <section className="panel s7" aria-labelledby="h-form">
          <header><h2 id="h-form">Linh kiện</h2></header>
          <form className="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            {replaced.length > 0 && (
              <div className="field">
                <span className="label-like">Linh kiện bạn đã thay ra khỏi máy</span>
                <div className="chips">
                  {replaced.map((p) => (
                    <button key={p.id} type="button" className="chip" aria-pressed={f.machinePartId === p.id} onClick={() => pickReplaced(p)}>{p.name}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="field">
              <span className="label-like" id="kind-label">Loại</span>
              <div className="segmented wrap" role="group" aria-labelledby="kind-label">
                {KINDS.map((k) => <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}
              </div>
            </div>
            {catalog ? (
              <div className="field">
                <label htmlFor="part">{f.kind === "gpu" ? "Card đồ họa" : "CPU"}</label>
                <select id="part" className="input" value={f.partName} onChange={(e) => setF((x) => ({ ...x, partName: e.target.value, machinePartId: "" }))}>
                  {f.kind === "gpu"
                    ? GPUS.filter((g) => !g.integrated).map((g) => <option key={g.name}>{g.name}</option>)
                    : [...new Set(CPUS.map((c) => c.socket))].map((s) => (
                      <optgroup key={s} label={`${s} · ${SOCKET_MEMORY[s]}`}>{CPUS.filter((c) => c.socket === s).map((c) => <option key={c.name}>{c.name}</option>)}</optgroup>
                    ))}
                </select>
                {f.machinePartId && <span className="hint">Đăng từ máy của bạn: bán xong, linh kiện tự đánh dấu đã bán.</span>}
              </div>
            ) : (
              <div className="field">
                <label htmlFor="title">Tên linh kiện</label>
                <input id="title" className="input" value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={80} required minLength={3}
                  placeholder={TITLE_HINT[f.kind]} />
              </div>
            )}
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
            <button className="btn primary block" disabled={busy || !name || price < 10_000}>{busy ? "Đang đăng…" : "Đăng tin"}</button>
          </form>
        </section>

        <section className="panel s5" aria-labelledby="h-preview">
          <header><h2 id="h-preview">Xem trước</h2><span className="meta">Người mua sẽ thấy</span></header>
          <div className="preview">
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ fontSize: 16 }}>{name || "Tên linh kiện"}</b>
              <span className={`pill ${f.condition === "like_new" || f.condition === "new" ? "pos" : f.condition === "for_parts" ? "warn" : ""}`}>{CONDITION_LABEL[f.condition]}</span>
            </div>
            <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>
              {[f.province || null, `@${user.handle}`, "hôm nay", Number(f.warranty) ? `bảo hành ${f.warranty} tháng` : null].filter(Boolean).join(" · ")}
            </div>
            <div className="answer num" style={{ marginTop: 12 }}>{price ? vnd(price) : "— ₫"}</div>
          </div>
          <ul className="rows" style={{ marginTop: 8 }}>
            <li className="row">
              <div className="grow"><div style={{ fontWeight: 500 }}>Điểm trên mỗi triệu đồng</div><div className="line2">Người mua dùng số này để so tin đáng tiền.</div></div>
              <span className="num" style={{ fontSize: 20, fontWeight: 600 }}>{value === null ? "—" : n0(value)}</span>
            </li>
            <li className="row">
              <div className="grow"><div style={{ fontWeight: 500 }}>So với tin cùng linh kiện</div>
                <div className="line2">{!catalog ? "Linh kiện ngoài danh mục: chưa so được." : ref ? `Giá giữa ${vnd(ref.median)} (${ref.count} tin)` : "Chưa có tin nào khác."}</div></div>
              {ref && price > 0 && (() => {
                const d = price / ref.median - 1;
                return <span className={`pill ${d <= -0.05 ? "pos" : d >= 0.1 ? "warn" : ""}`}>{Math.abs(d) < 0.05 ? "Ngang giá" : d < 0 ? `Rẻ hơn ${Math.round(-d * 100)}%` : `Đắt hơn ${Math.round(d * 100)}%`}</span>;
              })()}
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
