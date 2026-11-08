"use client";

import { listingPath } from "@/lib/listing-url";
import { localizePartLabel } from "@f2m/shared";
import { useI18n } from "@/i18n/client";
import { machineName } from "@/lib/use-machine";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import {
  DURATIONS, medianPrice, SAMPLE_ROWS, toRow, valueOf,
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
  const { t, p: lp, n0, vnd, locale } = useI18n();
  const T = t.post, L = t.listing;
  const label = (s: string) => localizePartLabel(s, locale);
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

  if (user === undefined) return <div className="title-row"><div><h1>{t.pages.postListing}</h1><p className="sub">{t.common.loading}</p></div></div>;
  if (user === null)
    return (
      <>
        <div className="title-row"><div><h1>{t.pages.postListing}</h1><p className="sub">{T.needLogin}</p></div></div>
        <p className="empty"><Link href={`${lp("/dang-nhap")}?next=/cho/dang-tin`} className="card-link">{T.loginOrSignup}</Link>{T.toPost}</p>
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
    part: part ? null : T.errPart,
    price: price >= 10_000 ? null : price ? T.errPriceMin : T.errPrice,
    contact: f.contact.trim().length >= 6 ? null : f.contact.trim() ? T.errContactShort : T.errContact,
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
        setStep(T.uploading(i + 1, pics.length));
        try { await uploadPhoto(r.item.id, p.blob); } catch { failed++; }
      }
      router.push(`${lp(listingPath(r.item))}${failed ? `?loi-anh=${failed}` : ""}`);
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="title-row">
        <div>
          <p className="crumb"><Link href={lp("/cho")} className="card-link">{t.nav.market}</Link></p>
          <h1>{t.pages.postListing}</h1>
          <p className="sub">{T.intro}</p>
        </div>
      </div>

      <div className="grid">
        <section className="panel s7" aria-labelledby="h-form">
          <header><h2 id="h-form">{T.partTitle}</h2><Link href={lp("/may")} className="card-link" style={{ fontSize: 13 }}>{T.editPc}</Link></header>
          {parts === null ? (
            <div className="skeleton" style={{ height: 160 }} aria-busy="true" />
          ) : parts.length === 0 ? (
            <p className="empty">{T.noPc} <Link href={lp("/may")} className="card-link">{T.declareAt}</Link></p>
          ) : (
            <form className="form" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              <p className="hint" style={{ margin: 0 }}>{T.required(<span className="req">*</span>)}</p>
              <fieldset className="pick" id="pick-part" tabIndex={-1} aria-invalid={!!show("part")} aria-describedby={show("part") ? "part-err" : undefined}>
                <legend className="sr-only">{T.pickPart}</legend>
                {groups.map((g) => (
                  <div key={g.name} className="pick-group">
                    <p className="pick-machine">{machineName(g.name, locale)}{g.primary && groups.length > 1 ? T.mainPc : ""}</p>
                    {g.items.map((p) => (
                      <label key={p.id} className={`pick-item${p.listingId ? " taken" : ""}`}>
                        <input type="radio" name="part" value={p.id} checked={f.partId === p.id} disabled={!!p.listingId} onChange={() => set("partId", p.id)} />
                        <span className="grow">
                          <span className="pick-name">{label(p.label)}</span>
                          <span className="line2">{L.kind[p.kind]} · {p.listingId ? T.listed : p.inUse ? T.installed : T.removed}</span>
                        </span>
                        <span className={`pill ${p.verified ? "pos" : ""}`}>{p.verified ? t.machine.verified : t.machine.unverified}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </fieldset>
              {show("part") && <p id="part-err" className="field-error" role="alert">{show("part")}</p>}
              {part?.inUse && <p className="notice" style={{ margin: 0 }}>{T.inUseNotice}</p>}

              <div className="row2">
                <div className="field">
                  <label htmlFor="price">{T.price} <span className="req" aria-hidden="true">*</span></label>
                  <input id="price" className="input num" inputMode="numeric" required aria-required="true" aria-invalid={!!show("price")} value={price ? n0(price) : ""}
                    onChange={(e) => set("price", e.target.value.replace(/\D/g, "").slice(0, 9))} placeholder={T.pricePh}
                    aria-describedby={show("price") ? "price-err price-hint" : "price-hint"} />
                  {show("price") && <span id="price-err" className="field-error" role="alert">{show("price")}</span>}
                  <span id="price-hint" className="hint">
                    {ref ? <>{T.priceRef(ref.count, vnd(ref.median))}{!price && <> · <button type="button" className="link-btn" onClick={() => set("price", String(ref.median))}>{T.useThisPrice}</button></>}</> : T.minPrice}
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="condition">{T.condition}</label>
                  <select id="condition" className="input" value={f.condition} onChange={(e) => set("condition", e.target.value as Condition)}>
                    {(["new", "like_new", "used", "for_parts"] as Condition[]).map((c) => <option key={c} value={c}>{L.condition[c]}</option>)}
                  </select>
                </div>
              </div>
              <div className="row2">
                <div className="field">
                  <label htmlFor="warranty">{T.warranty}</label>
                  <input id="warranty" className="input num" inputMode="numeric" value={f.warranty} onChange={(e) => set("warranty", e.target.value.replace(/\D/g, "").slice(0, 2))} />
                </div>
                <div className="field">
                  <label htmlFor="province">{T.area}</label>
                  <Combo id="province" value={f.province} onChange={(v) => set("province", v)} placeholder={T.areaPh}
                    options={[{ value: "", label: T.notChosen }, ...PROVINCES.map((p) => ({ value: p, label: p }))]} />
                </div>
              </div>
              <div className="field">
                <span className="label-like" id="days-label">{T.duration}</span>
                <div className="segmented wrap" role="group" aria-labelledby="days-label" aria-describedby="days-hint">
                  {DURATIONS.map((d) => <button key={d} type="button" aria-pressed={f.days === d} onClick={() => set("days", d)}>{t.common.days(d)}</button>)}
                </div>
                <span id="days-hint" className="hint">
                  {now ? T.endsAt(L.end(now + f.days * 86_400_000)) : ""}{T.expiryNote}
                </span>
              </div>
              <div className="field">
                <label htmlFor="contact">{T.contact} <span className="req" aria-hidden="true">*</span></label>
                <input id="contact" className="input" type="tel" inputMode="tel" autoComplete="tel" required aria-required="true" aria-invalid={!!show("contact")} minLength={6} maxLength={60}
                  value={f.contact} onChange={(e) => set("contact", e.target.value)} aria-describedby={show("contact") ? "contact-err contact-hint" : "contact-hint"} />
                {show("contact") && <span id="contact-err" className="field-error" role="alert">{show("contact")}</span>}
                <span id="contact-hint" className="hint">{T.contactHint}</span>
              </div>
              <div className="field">
                <label htmlFor="desc">{T.desc}</label>
                <textarea id="desc" className="input" maxLength={1000} value={f.description} onChange={(e) => set("description", e.target.value)}
                  placeholder={T.descPh} />
              </div>
              <PhotoPicker items={pics} onAdd={(fs) => void addPics(fs)} onRemove={removePic} onCover={coverPic} disabled={busy} error={picError} />
              {error && <p className="form-error" role="alert" style={{ marginTop: 0 }}>{error}</p>}
              <button className="btn primary block" disabled={busy}>{busy ? (step ?? T.posting) : T.submit}</button>
              {tried && firstBad && <p className="field-error" style={{ margin: 0, textAlign: "center" }}>{T.fillRequired}</p>}
            </form>
          )}
        </section>

        <section className="panel s5" aria-labelledby="h-preview">
          <header><h2 id="h-preview">{T.preview}</h2><span className="meta">{T.previewMeta}</span></header>
          <div className="preview">
            {pics[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="preview-photo" src={pics[0].src} alt={T.cover} />
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ fontSize: 16 }}>{part ? label(part.label) : T.pickFirst}</b>
              <span className={`pill ${f.condition === "like_new" || f.condition === "new" ? "pos" : f.condition === "for_parts" ? "warn" : ""}`}>{L.condition[f.condition]}</span>
            </div>
            <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>
              {[f.province || null, `@${user.handle}`, T.today, Number(f.warranty) ? T.warrantyM(f.warranty) : null, T.sellFor(f.days)].filter(Boolean).join(" · ")}
            </div>
            {part && <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>{T.fromPc(machineName(part.machineName, locale))} · {part.inUse ? T.inUse : T.removed} · <span style={{ color: part.verified ? "var(--positive)" : undefined }}>{part.verified ? T.verifiedLow : T.unverifiedLow}</span></div>}
            <div className="answer num" style={{ marginTop: 12 }}>{price ? vnd(price) : "— ₫"}</div>
          </div>
          <ul className="rows" style={{ marginTop: 8 }}>
            <li className="row">
              <div className="grow"><div style={{ fontWeight: 500 }}>{t.detail.valueTitle}</div><div className="line2">{T.valueText(!!catalog)}</div></div>
              <span className="num" style={{ fontSize: 20, fontWeight: 600 }}>{value === null ? "—" : n0(value)}</span>
            </li>
            <li className="row">
              <div className="grow"><div style={{ fontWeight: 500 }}>{t.detail.vsTitle}</div>
                <div className="line2">{ref ? T.vsText(vnd(ref.median), ref.count) : t.detail.vsNone}</div></div>
              {ref && price > 0 && (() => {
                const d = price / ref.median - 1;
                return <span className={`pill ${d <= -0.05 ? "pos" : d >= 0.1 ? "warn" : ""}`}>{Math.abs(d) < 0.05 ? t.detail.same : d < 0 ? t.detail.cheaper(Math.round(-d * 100)) : t.detail.pricier(Math.round(d * 100))}</span>;
              })()}
            </li>
            <li className="row">
              <div className="grow"><div style={{ fontWeight: 500 }}>{T.wantBadge}</div>
                <div className="line2">{T.badgeHow(<a href="/tai/pcdex-scan.exe" download className="card-link">pcdex-scan</a>)}</div></div>
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
