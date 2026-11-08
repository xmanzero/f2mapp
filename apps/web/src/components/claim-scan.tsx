"use client";

import {
  CPUS, GPUS, MAX_MACHINES, PART_KIND_LABEL, partLabel, sameScannedPart, specFromScan,
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

interface ScanView {
  code: string; pretty: string; result: ScanResult; createdAt: string; expiresAt: string; expired: boolean;
  claimed: { at: string; handle: string | null; machineName: string | null } | null;
}
const PSU_W = [450, 500, 550, 600, 650, 750, 850, 1000, 1200, 1600];
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

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
      router.push("/may");
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
        <div className="title-row"><div><h1>Gắn kết quả quét máy</h1>
          <p className="sub">Chạy phần mềm pcdex-scan trên máy tính cần quét, bấm “Gắn vào tài khoản”, rồi quét mã QR bằng điện thoại hoặc nhập mã ở đây.</p></div></div>
        <div className="scan-start">
        <section className="panel scan-entry scan-get">
          <Mascot size={96} />
          <div>
            <h2>Phần mềm pcdex-scan</h2>
            <p className="muted">Windows 10 / 11, không cần cài đặt, không cần quyền quản trị. Đọc CPU, card, mainboard, RAM, ổ cứng, màn hình trong vài giây. Chỉ gửi thông tin phần cứng khi bạn bấm gắn vào tài khoản.</p>
          </div>
          <a href="/tai/pcdex-scan.exe" download className="btn primary">Tải pcdex-scan.exe</a>
        </section>
        <section className="panel scan-entry">
          <form className="form" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) router.push(`/quet?ma=${encodeURIComponent(typed.trim().toUpperCase())}`); }}>
            <div className="field">
              <label htmlFor="scan-code">Mã trên phần mềm</label>
              <input id="scan-code" className="input scan-code" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="ABCD-EFGH"
                autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={12} />
            </div>
            <button className="btn primary" disabled={!typed.trim()}>Xem kết quả quét</button>
          </form>
        </section>
        </div>
      </>
    );

  const title = (
    <div className="title-row"><div><h1>Gắn kết quả quét máy</h1>
      <p className="sub">{scan ? <>Mã <b className="num">{scan.pretty}</b> · quét lúc {hhmm(scan.createdAt)}{!scan.claimed && !scan.expired && <> · dùng được đến {hhmm(scan.expiresAt)}</>}</> : "Đang tải…"}</p></div></div>
  );
  if (loadError)
    return <>{title}<p className="empty">{loadError} <Link href="/quet" className="card-link">Nhập mã khác</Link></p></>;
  if (!scan) return title;
  if (scan.claimed)
    return <>{title}<p className="empty">Kết quả quét này đã được gắn vào {scan.claimed.machineName ? <b>{scan.claimed.machineName}</b> : "một máy"}{scan.claimed.handle ? <> của @{scan.claimed.handle}</> : null}. <Link href="/may" className="card-link">Xem máy của tôi</Link></p></>;
  if (scan.expired)
    return <>{title}<p className="empty">Mã đã hết hạn (dùng được 30 phút). Bấm “Quét lại” trên phần mềm để lấy mã mới.</p></>;

  const r = scan.result;
  const kits = r.ram.length ? r.ram.map(partLabel.ram) : ["Không đọc được"];
  const drives = r.drives.length ? r.drives.map((d) => `${partLabel.drive(d)}${d.isBoot ? " · ổ hệ điều hành" : ""}${d.healthPct != null ? ` · sức khỏe ${d.healthPct}%` : ""}`) : ["Không đọc được"];
  const lines = target !== "new" && chosen && preview ? diff(chosen.spec, preview) : null;
  const changed = lines?.filter((l) => !l.same) ?? [];

  return (
    <>
      {title}
      <div className="grid split">
        <div className="col col-l">
          <section className="panel" aria-labelledby="scanned-h">
            <header><h2 id="scanned-h">Máy vừa quét</h2><span className="meta">{r.display ? `Màn hình ${r.display}` : null}</span></header>
            <dl className="detail-spec scan-spec">
              <div><dt>CPU</dt><dd>
                {r.cpu.name ? <>{r.cpu.name}<span className="pill pos">Nhận ra</span>{r.cpu.equivalent && <span className="faint small">tương đương {r.cpu.raw}</span>}</>
                  : <MissingPick raw={r.cpu.raw} value={cpu} onChange={setCpu} options={CPUS.map((c) => c.name)} id="pick-cpu" what="CPU" />}
              </dd></div>
              <div><dt>Card đồ họa</dt><dd>
                {r.gpu.name ? <>{r.gpu.name}<span className="pill pos">Nhận ra</span></>
                  : <MissingPick raw={`${r.gpu.raw}${r.gpu.vramGb ? ` ${r.gpu.vramGb} GB` : ""}`} value={gpu} onChange={setGpu} options={GPUS.map((g) => g.name)} id="pick-gpu" what="card" />}
              </dd></div>
              <div><dt>Mainboard</dt><dd>{partLabel.mainboard(r.mainboard)} <span className="faint small">khe card PCIe {r.mainboard.pcieGen}.0</span></dd></div>
              <div><dt>RAM</dt><dd className="stack">{kits.map((k) => <span key={k}>{k}</span>)}</dd></div>
              <div><dt>Ổ cứng</dt><dd className="stack">{drives.map((d, i) => <span key={i}>{d}</span>)}</dd></div>
              <div><dt>Nguồn</dt><dd><span className="muted">Phần mềm không đọc được nguồn</span></dd></div>
            </dl>
            {r.notes.length > 0 && <ul className="scan-notes">{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          </section>
        </div>

        <div className="col col-r">
          <section className="panel" aria-labelledby="where-h">
            <header><h2 id="where-h">Gắn vào đâu?</h2></header>
            {user === undefined || (user && !machines) ? <p className="muted">Đang tải…</p>
              : user === null ? (
                <div className="scan-login">
                  <p>Đăng nhập để lưu cấu hình này vào tài khoản. Linh kiện đọc được từ máy sẽ có nhãn <span className="pill pos">Xác thực đang dùng</span></p>
                  <Link href={`/dang-nhap?next=${encodeURIComponent(`/quet?ma=${scan.code}`)}`} className="btn primary">Đăng nhập để gắn</Link>
                </div>
              ) : (
                <>
                  <fieldset className="pick">
                    <legend className="sr-only">Chọn máy</legend>
                    {machines!.map((m) => (
                      <div key={m.id} className="pick-row">
                        <label className="pick-item">
                          <input type="radio" name="target" value={m.id} checked={target === m.id} onChange={() => setTarget(m.id)} />
                          <span className="grow">
                            <span className="pick-name">Cập nhật {m.name}{m.isPrimary && machines!.length > 1 ? " (máy chính)" : ""}</span>
                            <span className="line2">{m.spec.cpu} + {m.spec.gpu}</span>
                          </span>
                        </label>
                        {full && (confirmDel === m.id
                          ? <span className="confirm-del"><button type="button" className="btn small danger" onClick={() => remove(m.id)}>Xóa hẳn</button><button type="button" className="btn small" onClick={() => setConfirmDel(null)}>Thôi</button></span>
                          : <button type="button" className="icon-btn" aria-label={`Xóa ${m.name}`} onClick={() => setConfirmDel(m.id)}><Trash2 aria-hidden="true" /></button>)}
                      </div>
                    ))}
                    <label className={`pick-item${full ? " taken" : ""}`}>
                      <input type="radio" name="target" value="new" checked={target === "new"} disabled={full} onChange={() => setTarget("new")} />
                      <span className="grow">
                        <span className="pick-name">Tạo máy mới</span>
                        <span className="line2">{full ? `Đã có ${MAX_MACHINES} máy. Xóa bớt một máy để tạo máy mới.` : machines!.length ? "Thêm làm máy thứ hai" : "Máy đầu tiên trong tài khoản"}</span>
                      </span>
                    </label>
                  </fieldset>
                  {confirmDel && <p className="field-error" role="alert">Xóa máy sẽ xóa cả linh kiện trong kho của máy đó và ẩn tin đang bán. Không hoàn tác được.</p>}

                  {target === "new" ? (
                    <div className="field" style={{ marginTop: 14 }}>
                      <label htmlFor="psu">Nguồn (công suất) <span className="req">*</span></label>
                      <span className="select-wrap wide">
                        <select id="psu" className="input" value={psuW} onChange={(e) => setPsuW(Number(e.target.value))}>
                          {PSU_W.map((w) => <option key={w} value={w}>{w} W</option>)}
                        </select>
                      </span>
                      <span className="hint">Phần mềm không đọc được nguồn. Xem trên nhãn nguồn hoặc hóa đơn; sửa được sau.</span>
                    </div>
                  ) : lines && (
                    <div className="scan-diff">
                      <h3 className="sheet-h">{changed.length ? `Thay đổi (${changed.length})` : "Khớp với cấu hình đã khai"}</h3>
                      <ul>
                        {lines.map((l, i) => (
                          <li key={i} className={l.same ? "same" : "changed"}>
                            <span className="k">{PART_KIND_LABEL[l.kind]}</span>
                            {l.same ? <span>{l.to} <span className="faint">giữ nguyên, thêm xác thực</span></span>
                              : l.from && l.to ? <span><s>{l.from}</s> → <b>{l.to}</b></span>
                                : l.to ? <span><b>{l.to}</b> <span className="faint">thêm mới</span></span>
                                  : <span><s>{l.from}</s> <span className="faint">chuyển sang “đã thay ra”</span></span>}
                          </li>
                        ))}
                        <li className="same"><span className="k">Nguồn</span><span>{partLabel.psu(chosen!.spec.psu)} <span className="faint">giữ nguyên</span></span></li>
                      </ul>
                    </div>
                  )}

                  {error && <p className="form-error" role="alert">{error}</p>}
                  <button type="button" className="btn primary scan-go" disabled={busy || !cpu || !gpu || (target === "new" && full)} onClick={claim}>
                    {busy ? "Đang lưu…" : target === "new" ? "Tạo máy mới" : `Cập nhật ${chosen?.name ?? "máy"}`}
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
  return (
    <span className="missing-pick">
      <span>{raw} <span className="pill warn">Chưa có trong danh mục</span></span>
      <label htmlFor={id} className="faint small">Chọn {what} gần đúng nhất để tính điểm (không được tính là đã xác thực)</label>
      <Combo id={id} value={value} onChange={onChange} options={options.map((o) => ({ value: o, label: o }))} ariaLabel={`Chọn ${what} gần đúng`} />
    </span>
  );
}
