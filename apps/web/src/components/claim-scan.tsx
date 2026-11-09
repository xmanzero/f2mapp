"use client";

import { useI18n } from "@/i18n/client";
import { machineName } from "@/lib/use-machine";

import {
  CPUS, GPUS, localizePartLabel, MAX_MACHINES, partKindLabel, partLabel, sameScannedPart, specFromScan,
  type MachineSpec, type PartKind, type ScanResult,
} from "@f2m/shared";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { MachineView } from "@/lib/use-machine";
import { OPEN_MACHINE_KEY } from "@/lib/use-machine";
import { Combo } from "./combo";
import { Mascot } from "./mascot";
import { BenchCard } from "./bench-card";

interface ScanView {
  code: string; pretty: string; result: ScanResult; createdAt: string; expiresAt: string; expired: boolean;
  claimed: { at: string; handle: string | null; machineName: string | null } | null;
}
const PSU_W = [450, 500, 550, 600, 650, 750, 850, 1000, 1200, 1600];

/** Một dòng so sánh: linh kiện đang khai → linh kiện quét thấy */
interface DiffLine { kind: PartKind; from: string | null; to: string | null; same: boolean }
function diff(had: MachineSpec, now: MachineSpec): DiffLine[] {
  const one = (kind: PartKind, a: string, b: string, ad: unknown, bd: unknown): DiffLine =>
    ({ kind, from: a, to: b, same: a === b || sameScannedPart(kind, ad, bd, a, b) });
  const out: DiffLine[] = [
    one("cpu", had.cpu, now.cpu, {}, {}),
    one("gpu", had.gpu, now.gpu, {}, {}),
    one("mainboard", partLabel.mainboard(had.mainboard), partLabel.mainboard(now.mainboard), had.mainboard, now.mainboard),
  ];
  // RAM / ổ: ghép từng cái theo kiểu lỏng, còn thừa bên nào thì là thêm / bỏ
  for (const [kind, A, B, label] of [
    ["ram", had.ram, now.ram, partLabel.ram], ["storage", had.drives, now.drives, partLabel.drive],
  ] as const) {
    const used = new Set<number>();
    for (const b of B as unknown[]) {
      const i = (A as unknown[]).findIndex((a, k) => !used.has(k) && sameScannedPart(kind, a, b, "", ""));
      if (i >= 0) { used.add(i); out.push({ kind, from: (label as (x: never) => string)((A as never[])[i]!), to: (label as (x: never) => string)(b as never), same: true }); }
      else out.push({ kind, from: null, to: (label as (x: never) => string)(b as never), same: false });
    }
    (A as unknown[]).forEach((a, k) => { if (!used.has(k)) out.push({ kind, from: (label as (x: never) => string)(a as never), to: null, same: false }); });
  }
  return out;
}

export function ClaimScan() {
  const router = useRouter();
  const params = useSearchParams();
  const { t, p, locale } = useI18n();
  const T = t.scan;
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString(locale === "vi" ? "vi-VN" : "en-US", { hour: "2-digit", minute: "2-digit" });
  const nm = (n: string) => machineName(n, locale);
  const code = params.get("ma") ?? "";
  const { user } = useSession();
  const [typed, setTyped] = useState("");
  const [scan, setScan] = useState<ScanView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [machines, setMachines] = useState<(MachineView & { id: string })[] | null>(null);
  const [target, setTarget] = useState<string>(""); // id máy hoặc "new"
  const [cpu, setCpu] = useState("");
  const [gpu, setGpu] = useState("");
  const [psuW, setPsuW] = useState(650);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    setScan(null); setLoadError(null);
    api<ScanView>(`/v1/scans/${encodeURIComponent(code)}`).then((s) => {
      setScan(s);
      setCpu(s.result.cpu.name ?? s.result.cpu.suggestion ?? "");
      setGpu(s.result.gpu.name ?? s.result.gpu.suggestion ?? "");
    }).catch((e: ApiError) => setLoadError(e.message));
  }, [code]);

  const loadMachines = useCallback(() => api<{ machines: (MachineView & { id: string })[] }>("/v1/me/machines").then((r) => {
    setMachines(r.machines);
    setTarget((t) => t && (t === "new" || r.machines.some((m) => m.id === t)) ? t
      : r.machines.find((m) => m.isPrimary)?.id ?? (r.machines.length < MAX_MACHINES ? "new" : r.machines[0]?.id ?? "new"));
  }), []);
  useEffect(() => { if (user) void loadMachines().catch(() => setMachines([])); }, [user, loadMachines]);

  const chosen = machines?.find((m) => m.id === target) ?? null;
  const preview = useMemo(() => {
    if (!scan || !cpu || !gpu) return null;
    return specFromScan(scan.result, { cpu, gpu, psu: chosen ? chosen.spec.psu : { wattage: psuW, model: null, rating: null } });
  }, [scan, cpu, gpu, chosen, psuW]);
  const full = (machines?.length ?? 0) >= MAX_MACHINES;

  const claim = async () => {
    if (!scan) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ machineId: string }>(`/v1/scans/${scan.code}/claim`, {
        body: { machineId: target === "new" ? null : target, cpu, gpu, ...(target === "new" ? { psuW } : {}) },
      });
      try { sessionStorage.setItem(OPEN_MACHINE_KEY, r.machineId); } catch { /* bỏ qua */ }
      router.push(p("/may"));
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    setError(null);
    try {
      await api(`/v1/me/machines/${id}`, { method: "DELETE" });
      setConfirmDel(null);
      setTarget("new");
      await loadMachines();
    } catch (e) { setError((e as ApiError).message); }
  };

  // ---------- chưa có mã ----------
  if (!code)
    return (
      <>
        <div className="title-row"><div><h1>{t.pages.scan}</h1>
          <p className="sub">{T.intro}</p></div></div>
        <div className="scan-start">
        <section className="panel scan-entry scan-get">
          <Mascot size={96} />
          <div>
            <h2>{T.app}</h2>
            <p className="muted">{T.appText}</p>
          </div>
          <a href="/tai/pcdex-scan.exe" download className="btn primary">{T.download}</a>
        </section>
        <section className="panel scan-entry">
          <form className="form" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) router.push(`${p("/quet")}?ma=${encodeURIComponent(typed.trim().toUpperCase())}`); }}>
            <div className="field">
              <label htmlFor="scan-code">{T.codeLabel}</label>
              <input id="scan-code" className="input scan-code" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="ABCD-EFGH"
                autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={12} />
            </div>
            <button className="btn primary" disabled={!typed.trim()}>{T.viewResult}</button>
          </form>
        </section>
        </div>
      </>
    );

  const title = (
    <div className="title-row"><div><h1>{t.pages.scan}</h1>
      <p className="sub">{scan ? T.head(scan.pretty, hhmm(scan.createdAt), !scan.claimed && !scan.expired ? hhmm(scan.expiresAt) : null) : t.common.loading}</p></div></div>
  );
  if (loadError)
    return <>{title}<p className="empty">{loadError} <Link href={p("/quet")} className="card-link">{T.otherCode}</Link></p></>;
  if (!scan) return title;
  if (scan.claimed)
    return <>{title}<p className="empty">{T.claimed(scan.claimed.machineName ? <b>{nm(scan.claimed.machineName)}</b> : null, scan.claimed.handle)} <Link href={p("/may")} className="card-link">{T.seeMine}</Link></p></>;
  if (scan.expired)
    return <>{title}<p className="empty">{T.expired}</p></>;

  const r = scan.result;
  const kits = r.ram.length ? r.ram.map(partLabel.ram) : [T.unreadable];
  const drives = r.drives.length ? r.drives.map((d) => `${partLabel.drive(d)}${d.isBoot ? T.bootDrive : ""}${d.healthPct != null ? T.health(d.healthPct) : ""}`) : [T.unreadable];
  const lines = target !== "new" && chosen && preview ? diff(chosen.spec, preview) : null;
  const changed = lines?.filter((l) => !l.same) ?? [];

  return (
    <>
      {title}
      <div className="grid split">
        <div className="col col-l">
          <section className="panel" aria-labelledby="scanned-h">
            <header><h2 id="scanned-h">{T.scanned}</h2><span className="meta">{r.display ? T.screen(r.display) : null}</span></header>
            <dl className="detail-spec scan-spec">
              <div><dt>CPU</dt><dd>
                {r.cpu.name ? <>{r.cpu.name}<span className="pill pos">{T.recognized}</span>{r.cpu.equivalent && <span className="faint small">{T.equivalent(r.cpu.raw)}</span>}</>
                  : <MissingPick raw={r.cpu.raw} value={cpu} onChange={setCpu} options={CPUS.map((c) => c.name)} id="pick-cpu" what="CPU" />}
              </dd></div>
              <div><dt>{t.cfg.gpu}</dt><dd>
                {r.gpu.name ? <>{r.gpu.name}<span className="pill pos">{T.recognized}</span></>
                  : <MissingPick raw={`${r.gpu.raw}${r.gpu.vramGb ? ` ${r.gpu.vramGb} GB` : ""}`} value={gpu} onChange={setGpu} options={GPUS.map((g) => g.name)} id="pick-gpu" what={T.cardWhat} />}
              </dd></div>
              <div><dt>{t.listing.kind.mainboard}</dt><dd>{localizePartLabel(partLabel.mainboard(r.mainboard), locale)} <span className="faint small">{T.slot(r.mainboard.pcieGen)}</span></dd></div>
              <div><dt>RAM</dt><dd className="stack">{kits.map((k) => <span key={k}>{k}</span>)}</dd></div>
              <div><dt>{t.listing.kind.storage}</dt><dd className="stack">{drives.map((d, i) => <span key={i}>{d}</span>)}</dd></div>
              <div><dt>{t.listing.kind.psu}</dt><dd><span className="muted">{T.noPsu}</span></dd></div>
            </dl>
            {r.notes.length > 0 && <ul className="scan-notes">{r.notes.map((n) => <li key={n}>{T.notes[n] ?? n}</li>)}</ul>}
          </section>
          {r.bench && <BenchCard bench={r.bench} />}
        </div>

        <div className="col col-r">
          <section className="panel" aria-labelledby="where-h">
            <header><h2 id="where-h">{T.where}</h2></header>
            {user === undefined || (user && !machines) ? <p className="muted">{t.common.loading}</p>
              : user === null ? (
                <div className="scan-login">
                  <p>{T.loginText(<span className="pill pos">{t.machine.verified}</span>)}</p>
                  <Link href={`${p("/dang-nhap")}?next=${encodeURIComponent(`/quet?ma=${scan.code}`)}`} className="btn primary">{T.loginBtn}</Link>
                </div>
              ) : (
                <>
                  <fieldset className="pick">
                    <legend className="sr-only">{T.chooseMachine}</legend>
                    {machines!.map((m) => (
                      <div key={m.id} className="pick-row">
                        <label className="pick-item">
                          <input type="radio" name="target" value={m.id} checked={target === m.id} onChange={() => setTarget(m.id)} />
                          <span className="grow">
                            <span className="pick-name">{T.update(nm(m.name))}{m.isPrimary && machines!.length > 1 ? T.mainPc : ""}</span>
                            <span className="line2">{m.spec.cpu} + {m.spec.gpu}</span>
                          </span>
                        </label>
                        {full && (confirmDel === m.id
                          ? <span className="confirm-del"><button type="button" className="btn small danger" onClick={() => remove(m.id)}>{T.deleteHard}</button><button type="button" className="btn small" onClick={() => setConfirmDel(null)}>{t.account.never}</button></span>
                          : <button type="button" className="icon-btn" aria-label={T.deleteAria(nm(m.name))} onClick={() => setConfirmDel(m.id)}><Trash2 aria-hidden="true" /></button>)}
                      </div>
                    ))}
                    <label className={`pick-item${full ? " taken" : ""}`}>
                      <input type="radio" name="target" value="new" checked={target === "new"} disabled={full} onChange={() => setTarget("new")} />
                      <span className="grow">
                        <span className="pick-name">{T.newPc}</span>
                        <span className="line2">{full ? T.full(MAX_MACHINES) : machines!.length ? T.asSecond : T.asFirst}</span>
                      </span>
                    </label>
                  </fieldset>
                  {confirmDel && <p className="field-error" role="alert">{T.deleteWarn}</p>}

                  {target === "new" ? (
                    <div className="field" style={{ marginTop: 14 }}>
                      <label htmlFor="psu">{T.psu} <span className="req">*</span></label>
                      <span className="select-wrap wide">
                        <select id="psu" className="input" value={psuW} onChange={(e) => setPsuW(Number(e.target.value))}>
                          {PSU_W.map((w) => <option key={w} value={w}>{w} W</option>)}
                        </select>
                      </span>
                      <span className="hint">{T.psuHint}</span>
                    </div>
                  ) : lines && (
                    <div className="scan-diff">
                      <h3 className="sheet-h">{changed.length ? T.changes(changed.length) : T.matches}</h3>
                      <ul>
                        {lines.map((l, i) => (
                          <li key={i} className={l.same ? "same" : "changed"}>
                            <span className="k">{partKindLabel(l.kind, locale)}</span>
                            {l.same ? <span>{l.to} <span className="faint">{T.keepVerify}</span></span>
                              : l.from && l.to ? <span><s>{l.from}</s> → <b>{l.to}</b></span>
                                : l.to ? <span><b>{l.to}</b> <span className="faint">{T.added}</span></span>
                                  : <span><s>{l.from}</s> <span className="faint">{T.toStock}</span></span>}
                          </li>
                        ))}
                        <li className="same"><span className="k">{t.listing.kind.psu}</span><span>{localizePartLabel(partLabel.psu(chosen!.spec.psu), locale)} <span className="faint">{T.kept}</span></span></li>
                      </ul>
                    </div>
                  )}

                  {error && <p className="form-error" role="alert">{error}</p>}
                  <button type="button" className="btn primary scan-go" disabled={busy || !cpu || !gpu || (target === "new" && full)} onClick={claim}>
                    {busy ? t.common.saving : target === "new" ? T.newPc : T.update(chosen ? nm(chosen.name) : T.machineFallback)}
                  </button>
                </>
              )}
          </section>
        </div>
      </div>
    </>
  );
}

/** CPU / card chưa có trong danh mục: chọn mẫu gần đúng (mẫu tự chọn không được xác thực) */
function MissingPick({ raw, value, onChange, options, id, what }: { raw: string; value: string; onChange: (v: string) => void; options: string[]; id: string; what: string }) {
  const { t } = useI18n();
  const T = t.scan;
  return (
    <span className="missing-pick">
      <span>{raw} <span className="pill warn">{T.notInCatalog}</span></span>
      <label htmlFor={id} className="faint small">{T.pickClosest(what)}</label>
      <Combo id={id} value={value} onChange={onChange} options={options.map((o) => ({ value: o, label: o }))} ariaLabel={T.pickClosestAria(what)} />
    </span>
  );
}
