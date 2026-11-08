"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { DEFAULT_BRANDING, type BrandAsset, type Branding } from "@/lib/branding-shared";
import { BrandLogo, BrandMark } from "./brand-logo";

type Raw = { siteName: string | null; slogan: string | null; description: string | null; logo: BrandAsset | null; logoLight: BrandAsset | null; favicon: BrandAsset | null };
type Kind = "logo" | "logo_light" | "favicon";

const SLOTS: { kind: Kind; key: "logo" | "logoLight" | "favicon"; name: string; hint: string; ground: "dark" | "light" }[] = [
  { kind: "logo", key: "logo", name: "Logo", ground: "dark",
    hint: "Hiện ở thanh bên, trang chủ. Ảnh ngang, nền trong suốt, chữ sáng (web nền tối). Tốt nhất SVG; PNG / WebP cao từ 120 px. Tối đa 1 MB." },
  { kind: "logo_light", key: "logoLight", name: "Logo cho nền sáng", ground: "light",
    hint: "Không bắt buộc. Dùng khi người xem bật chế độ Ngày; bỏ trống thì dùng logo trên. Chữ tối, nền trong suốt." },
  { kind: "favicon", key: "favicon", name: "Favicon", ground: "dark",
    hint: "Icon trên tab trình duyệt, màn hình điện thoại. Ảnh vuông, tốt nhất SVG hoặc PNG 512×512. Máy chủ tự tạo các cỡ 16–512 px." },
];

/** Thương hiệu: tên web, slogan, mô tả, logo (nền tối / nền sáng), favicon — áp dụng cho toàn bộ web */
export function AdminBranding() {
  const router = useRouter();
  const [raw, setRaw] = useState<Raw | null>(null);
  const [text, setText] = useState({ siteName: "", slogan: "", description: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<Raw>("/v1/admin/branding").then((r) => {
      setRaw(r);
      setText({ siteName: r.siteName ?? DEFAULT_BRANDING.siteName, slogan: r.slogan ?? DEFAULT_BRANDING.slogan, description: r.description ?? DEFAULT_BRANDING.description });
    }).catch((e: ApiError) => setMsg({ ok: false, text: e.message }));
  }, []);

  // xem trước: chữ đang soạn + ảnh đã lưu
  const preview: Branding | null = raw && {
    siteName: text.siteName || DEFAULT_BRANDING.siteName, slogan: text.slogan, description: text.description,
    logo: raw.logo, logoLight: raw.logoLight, favicon: raw.favicon,
  };

  /** Lưu xong: bỏ bản lưu đệm của web để mọi trang dùng thương hiệu mới ngay */
  const applied = async (r: Raw, done: string) => {
    setRaw(r);
    await fetch("/brand-refresh", { method: "POST" }).catch(() => {});
    router.refresh();
    setMsg({ ok: true, text: done });
  };
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: (e as ApiError).message }); }
    setBusy(null);
  };
  const saveText = () => run("text", async () => applied(await api<Raw>("/v1/admin/branding", { method: "PUT", body: text }), "Đã lưu tên, slogan và mô tả."));
  const upload = (kind: Kind, file: File) => run(kind, async () => {
    const type = file.type || (file.name.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "");
    if (!/^image\/(svg\+xml|png|webp)$/.test(type)) throw new ApiError(400, "Chỉ nhận SVG, PNG hoặc WebP.");
    if (file.size > 1024 * 1024) throw new ApiError(413, "Ảnh tối đa 1 MB.");
    const res = await fetch(`/api/v1/admin/branding/${kind}`, { method: "PUT", headers: { "content-type": type }, body: file, credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.message ?? `Lỗi máy chủ (${res.status})`);
    await applied(data as Raw, "Đã cập nhật ảnh.");
  });
  const reset = (kind: Kind) => run(kind, async () => applied(await api<Raw>(`/v1/admin/branding/${kind}`, { method: "DELETE" }), "Đã dùng lại ảnh mặc định."));

  if (!raw || !preview) return msg ? <p className="form-error" role="alert">{msg.text}</p> : <p className="muted">Đang tải…</p>;
  const textDirty = text.siteName !== (raw.siteName ?? DEFAULT_BRANDING.siteName) || text.slogan !== (raw.slogan ?? DEFAULT_BRANDING.slogan)
    || text.description !== (raw.description ?? DEFAULT_BRANDING.description);

  return (
    <div className="brand-admin">
      {msg && <p className={msg.ok ? "ok-text" : "form-error"} role="status" style={{ marginTop: 0 }}>{msg.text}</p>}
      <div className="grid">
        <section className="panel s7" aria-labelledby="h-brand-text">
          <header><h2 id="h-brand-text">Tên và slogan</h2><span className="meta">Tiêu đề tab, thanh bên, chân trang chủ, Google</span></header>
          <form className="form" onSubmit={(e) => { e.preventDefault(); void saveText(); }}>
            <div className="row2">
              <Field id="b-name" label="Tên web" max={40} value={text.siteName} onChange={(v) => setText({ ...text, siteName: v })} />
              <Field id="b-slogan" label="Slogan" max={80} value={text.slogan} onChange={(v) => setText({ ...text, slogan: v })}
                hint="Bỏ trống để ẩn. VD: Build it. Show it. Trade it." />
            </div>
            <div className="field">
              <label htmlFor="b-desc">Mô tả (SEO)</label>
              <textarea id="b-desc" className="input" rows={3} maxLength={300} value={text.description} onChange={(e) => setText({ ...text, description: e.target.value })} />
              <span className="hint">{text.description.length}/300 · hiện dưới tiêu đề trong kết quả tìm kiếm và khi chia sẻ link.</span>
            </div>
            <div className="mail-actions">
              <button className="btn primary" disabled={busy === "text" || !textDirty || !text.siteName.trim()}>{busy === "text" ? "Đang lưu…" : textDirty ? "Lưu" : "Đã lưu"}</button>
              {textDirty && <button type="button" className="btn" onClick={() => setText({ siteName: raw.siteName ?? DEFAULT_BRANDING.siteName, slogan: raw.slogan ?? DEFAULT_BRANDING.slogan, description: raw.description ?? DEFAULT_BRANDING.description })}>Bỏ thay đổi</button>}
            </div>
          </form>
        </section>

        <section className="panel s5" aria-labelledby="h-brand-preview">
          <header><h2 id="h-brand-preview">Xem trước</h2></header>
          <div className="brand-tab" aria-hidden="true">
            <BrandMark brand={preview} size={16} />
            <span>{preview.slogan ? `${preview.siteName} · ${preview.slogan}` : preview.siteName}</span>
          </div>
          <div className="brand-stage dark" aria-label="Thanh bên, chế độ Đêm">
            <BrandLogo brand={preview} height={30} />
            {preview.slogan && <small>{preview.slogan}</small>}
          </div>
          <div className="brand-stage light" aria-label="Thanh bên, chế độ Ngày">
            <BrandLogo brand={preview} height={30} />
            {preview.slogan && <small>{preview.slogan}</small>}
          </div>
          {raw.logo && !raw.logoLight && <p className="notice small">Logo nền tối đang dùng cả ở chế độ Ngày. Nếu chữ trong logo màu sáng, tải thêm “Logo cho nền sáng” để không bị chìm.</p>}
          <p className="faint small">Chữ đang soạn hiện ngay ở đây; ảnh hiện sau khi tải lên.</p>
        </section>
      </div>

      <div className="brand-slots">
        {SLOTS.map((s) => (
          <Slot key={s.kind} slot={s} asset={raw[s.key]} brand={preview} busy={busy === s.kind}
            onFile={(f) => upload(s.kind, f)} onReset={() => reset(s.kind)} />
        ))}
      </div>
    </div>
  );
}

function Field({ id, label, value, onChange, max, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; max: number; hint?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

function Slot({ slot, asset, brand, busy, onFile, onReset }: {
  slot: (typeof SLOTS)[number]; asset: BrandAsset | null; brand: Branding; busy: boolean; onFile: (f: File) => void; onReset: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState(false);
  const shown: Branding = slot.kind === "logo_light" ? { ...brand, logo: asset ?? brand.logo, logoLight: null } : brand;
  return (
    <section className="panel brand-slot" aria-labelledby={`h-slot-${slot.kind}`}>
      <header>
        <h2 id={`h-slot-${slot.kind}`}>{slot.name}</h2>
        <span className={`pill ${asset ? "pos" : ""}`}>{asset ? "Đã tải lên" : slot.kind === "logo_light" ? "Chưa có" : "Mặc định"}</span>
      </header>
      <div className={`brand-stage ${slot.ground} big`}>
        {slot.kind === "favicon"
          ? <div className="brand-fav"><BrandMark brand={brand} size={64} /><BrandMark brand={brand} size={32} /><BrandMark brand={brand} size={16} /></div>
          : slot.kind === "logo_light" && !asset ? <span className="faint small">Dùng logo nền tối</span> : <BrandLogo brand={shown} height={44} />}
      </div>
      {asset && <p className="faint small">{asset.mime.replace("image/", "").replace("+xml", "").toUpperCase()} · {asset.width}×{asset.height}</p>}
      <p className="muted small">{slot.hint}</p>
      <input ref={input} type="file" accept=".svg,.png,.webp,image/svg+xml,image/png,image/webp" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      <div className="mail-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Đang tải lên…" : asset ? "Đổi ảnh" : "Tải ảnh lên"}</button>
        {asset && (confirm ? (
          <span className="row-confirm">
            <button type="button" className="btn small danger" onClick={() => { setConfirm(false); onReset(); }}>{slot.kind === "logo_light" ? "Xóa" : "Dùng mặc định"}</button>
            <button type="button" className="btn small" onClick={() => setConfirm(false)}>Thôi</button>
          </span>
        ) : <button type="button" className="link-btn" onClick={() => setConfirm(true)}>{slot.kind === "logo_light" ? "Xóa ảnh" : "Dùng lại mặc định"}</button>)}
      </div>
    </section>
  );
}
