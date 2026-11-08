"use client";

import {
  ANCHOR_CPU, ANCHOR_GPU, findCpu, findGpu, machineInputSchema, machineSpecSchema, MAX_MACHINES, partLabel, specFromInput, specToInput,
  type MachineInput, type MachineSpec, type PartKind,
} from "@f2m/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { useSession } from "./session";
import { makeI18n, type Locale } from "@/i18n";

const KEY = "f2m.spec.v1";
const OLD_KEY = "f2m.machine.v1";
export const SAMPLE_MACHINE: MachineInput = {
  cpu: ANCHOR_CPU, gpu: ANCHOR_GPU, ramGb: 16, ramChannels: 2, storage: "nvme3", pcieGen: 4, psuW: 550, resolution: 1080,
};
export const SAMPLE_SPEC: MachineSpec = specFromInput(SAMPLE_MACHINE);

/** Trang /quet ghi id máy vừa cập nhật vào đây để trang Máy của tôi mở đúng máy đó */
export const OPEN_MACHINE_KEY = "f2m.openMachine";

export interface PartView {
  /** null = máy chưa lưu lên tài khoản */
  id: string | null; kind: PartKind; label: string; status: "in_use" | "replaced" | "for_sale" | "sold";
  verified: boolean; listingId: string | null; addedAt: string | null;
  /** có substituteFor = mẫu gần đúng thay cho CPU / card quét thấy nhưng chưa có trong danh mục */
  details?: unknown;
}
export interface MachineView {
  /** null = máy trên trình duyệt (khách) hoặc máy mẫu */
  id: string | null; name: string; isPrimary: boolean; spec: MachineSpec; parts: PartView[];
  missing: PartKind[]; verified: boolean; lastScanAt: string | null; power?: number; tier?: string;
}

function validSpec(raw: unknown): MachineSpec | null {
  const p = machineSpecSchema.safeParse(raw);
  return p.success && findCpu(p.data.cpu) && findGpu(p.data.gpu) ? (p.data as MachineSpec) : null;
}
function readLocal(): MachineSpec | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return validSpec(JSON.parse(raw));
    // bản cũ chỉ lưu dạng tóm tắt
    const old = localStorage.getItem(OLD_KEY);
    if (!old) return null;
    const m = machineInputSchema.safeParse(JSON.parse(old));
    return m.success && findCpu(m.data.cpu) && findGpu(m.data.gpu) ? specFromInput(m.data) : null;
  } catch {
    return null;
  }
}
function writeLocal(s: MachineSpec) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* trình duyệt chặn lưu: vẫn dùng được trong phiên này */ }
}

/** Linh kiện của một cấu hình chưa lưu lên tài khoản (để hiển thị cùng một kiểu) */
export function partsFromSpec(s: MachineSpec): PartView[] {
  const base = { id: null, status: "in_use" as const, verified: false, listingId: null, addedAt: null };
  return [
    { ...base, kind: "cpu", label: s.cpu }, { ...base, kind: "gpu", label: s.gpu },
    { ...base, kind: "mainboard", label: partLabel.mainboard(s.mainboard) },
    ...s.ram.map((k) => ({ ...base, kind: "ram" as const, label: partLabel.ram(k) })),
    ...s.drives.map((d) => ({ ...base, kind: "storage" as const, label: partLabel.drive(d) })),
    { ...base, kind: "psu", label: partLabel.psu(s.psu) },
  ];
}
const localView = (spec: MachineSpec): MachineView =>
  ({ id: null, name: "Máy của tôi", isPrimary: true, spec, parts: partsFromSpec(spec), missing: [], verified: false, lastScanAt: null });

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Các máy của người dùng (tối đa 2), cấu hình chi tiết.
 * - Khách: một máy trên trình duyệt (localStorage).
 * - Đã đăng nhập: các máy trên tài khoản. Tài khoản chưa có máy thì để trống (`empty`), không tự gán máy mẫu hay máy trên trình duyệt;
 *   người dùng quét bằng pcdex-scan hoặc tự chọn linh kiện. Các trang khác (chợ, xếp hạng) vẫn so với máy mẫu (`isSample`).
 * `ready` = false cho tới khi biết là khách hay đã đăng nhập.
 */
export function useMachine() {
  const { user } = useSession();
  const [local, setLocal] = useState<MachineSpec | null>(null);
  const [localLoaded, setLocalLoaded] = useState(false);
  const [server, setServer] = useState<MachineView[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [justScanned, setJustScanned] = useState(false);
  const [draft, setDraft] = useState<MachineSpec | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setLocal(readLocal()); setLocalLoaded(true); }, []);

  const reload = useCallback(async () => {
    const r = await api<{ machines: MachineView[] }>("/v1/me/machines");
    setServer(r.machines);
    return r.machines;
  }, []);

  useEffect(() => {
    if (!user) { setServer(null); return; }
    void reload().then((ms) => {
      let open: string | null = null;
      try { open = sessionStorage.getItem(OPEN_MACHINE_KEY); sessionStorage.removeItem(OPEN_MACHINE_KEY); } catch { /* bỏ qua */ }
      if (open && ms.some((m) => m.id === open)) { setActiveId(open); setJustScanned(true); }
    }).catch(() => setServer([]));
  }, [user, reload]);

  const ready = localLoaded && user !== undefined && (user === null || server !== null);
  const machines: MachineView[] = user ? (server?.length ? server : [localView(SAMPLE_SPEC)]) : [localView(local ?? SAMPLE_SPEC)];
  const active = machines.find((m) => m.id === activeId) ?? machines.find((m) => m.isPrimary) ?? machines[0]!;
  const isSample = user ? !server?.length : !local;
  /** Tài khoản chưa có máy: không gán máy mẫu, trang Máy của tôi hiện màn hình thêm máy */
  const empty = !!user && server !== null && server.length === 0;
  const spec = draft ?? active.spec;

  // đổi máy đang xem thì bỏ bản nháp
  useEffect(() => { setDraft(null); }, [active.id]);

  const save = useCallback((next: MachineSpec) => {
    setDraft(next);
    setError(null);
    if (!user) {
      writeLocal(next);
      setLocal(next);
      setSaveState("saved");
      return;
    }
    // gom các thay đổi liên tiếp, lưu sau 500 ms
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    const id = active.id;
    timer.current = setTimeout(() => {
      api<{ machines: MachineView[] }>(id ? `/v1/me/machines/${id}` : "/v1/me/machines", { method: id ? "PUT" : "POST", body: { spec: next } })
        .then((r) => { setServer(r.machines); setDraft(null); setSaveState("saved"); })
        .catch((e: ApiError) => { setSaveState("error"); setError(e.message); });
    }, 500);
  }, [user, active.id]);

  const run = useCallback(async (fn: () => Promise<{ machines: MachineView[] }>) => {
    setError(null);
    try { const r = await fn(); setServer(r.machines); return r.machines; }
    catch (e) { setError((e as ApiError).message); return null; }
  }, []);
  const [adding, setAdding] = useState(false);
  /** Sau khi tạo máy (màn hình thêm máy): tải lại và mở máy vừa tạo */
  const created = useCallback(async () => {
    const before = new Set(server?.map((m) => m.id));
    const ms = await reload();
    const added = ms.find((m) => !before.has(m.id));
    if (added) setActiveId(added.id);
    setAdding(false);
  }, [reload, server]);
  const rename = useCallback((name: string) => active.id && run(() => api(`/v1/me/machines/${active.id}`, { method: "PUT", body: { name, spec } })), [run, active.id, spec]);
  const setPrimary = useCallback((id: string) => run(() => api(`/v1/me/machines/${id}/primary`, { method: "POST", body: {} })), [run]);
  const removeMachine = useCallback(async (id: string) => {
    const ms = await run(() => api(`/v1/me/machines/${id}`, { method: "DELETE" }));
    if (ms) setActiveId(null);
  }, [run]);

  return {
    ready, user, machines, active, activeId: active.id, setActiveId, spec, machine: specToInput(spec), isSample,
    save, saveState, error, savedTo: user ? ("account" as const) : ("browser" as const),
    canAdd: !!user && (server?.length ?? 0) > 0 && (server?.length ?? 0) < MAX_MACHINES,
    empty, browserSpec: local, adding, startAdding: () => setAdding(true), cancelAdding: () => setAdding(false), created, rename, setPrimary, removeMachine, reload, justScanned, dismissScanned: () => setJustScanned(false),
  };
}

/** Tên máy mặc định lưu bằng tiếng Việt ("Máy của tôi", "Máy 2") → hiển thị theo ngôn ngữ trang; tên người dùng tự đặt giữ nguyên */
export function machineName(name: string, locale: Locale) {
  if (locale === "vi") return name;
  const T = makeI18n(locale).t.machine;
  if (name === "Máy của tôi") return T.defaultName;
  const m = /^Máy (\d+)$/.exec(name);
  return m ? T.nthName(Number(m[1])) : name;
}
