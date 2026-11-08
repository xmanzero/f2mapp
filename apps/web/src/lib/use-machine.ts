"use client";

import {
  ANCHOR_CPU, ANCHOR_GPU, findCpu, findGpu, machineInputSchema, machineSpecSchema, MAX_MACHINES, partLabel, specFromInput, specToInput,
  type MachineInput, type MachineSpec, type PartKind,
} from "@f2m/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { useSession } from "./session";

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
 * - Đã đăng nhập: các máy trên tài khoản. Lần đầu đăng nhập mà tài khoản chưa có máy, máy trên trình duyệt được đưa lên.
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
  const uploaded = useRef(false);

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

  // Đăng nhập lần đầu: tài khoản chưa có máy, trình duyệt có → đưa lên
  useEffect(() => {
    if (!user || !server || server.length || !local || uploaded.current) return;
    uploaded.current = true;
    api("/v1/me/machines", { method: "POST", body: { spec: local } }).then(reload).catch(() => { uploaded.current = false; });
  }, [user, server, local, reload]);

  const ready = localLoaded && user !== undefined && (user === null || server !== null);
  const machines: MachineView[] = user && server?.length ? server : [localView(local ?? SAMPLE_SPEC)];
  const active = machines.find((m) => m.id === activeId) ?? machines.find((m) => m.isPrimary) ?? machines[0]!;
  const isSample = user ? !server?.length && !local : !local;
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
  const addMachine = useCallback(async (name: string) => {
    const ms = await run(() => api("/v1/me/machines", { method: "POST", body: { name, spec: SAMPLE_SPEC } }));
    const added = ms?.find((m) => !server?.some((s) => s.id === m.id));
    if (added) setActiveId(added.id);
  }, [run, server]);
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
    addMachine, rename, setPrimary, removeMachine, reload, justScanned, dismissScanned: () => setJustScanned(false),
  };
}
