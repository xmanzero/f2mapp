"use client";

import { ANCHOR_CPU, ANCHOR_GPU, findCpu, findGpu, machineInputSchema, type MachineInput } from "@f2m/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useSession } from "./session";

const KEY = "f2m.machine.v1";
export const SAMPLE_MACHINE: MachineInput = {
  cpu: ANCHOR_CPU, gpu: ANCHOR_GPU, ramGb: 16, ramChannels: 2, storage: "nvme3", pcieGen: 4, psuW: 550, resolution: 1080,
};

function readLocal(): MachineInput | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = machineInputSchema.safeParse(JSON.parse(raw));
    // linh kiện bị bỏ khỏi danh mục thì coi như chưa có
    return parsed.success && findCpu(parsed.data.cpu) && findGpu(parsed.data.gpu) ? parsed.data : null;
  } catch {
    return null;
  }
}
function writeLocal(m: MachineInput) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* trình duyệt chặn lưu: vẫn dùng được trong phiên này */ }
}

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Máy của người dùng.
 * - Khách: lưu trên trình duyệt (localStorage).
 * - Đã đăng nhập: lưu lên tài khoản. Lần đầu đăng nhập mà tài khoản chưa có máy, máy đang có trên trình duyệt được đưa lên.
 * `ready` = false cho tới khi biết là khách hay đã đăng nhập (máy chủ không đọc được localStorage).
 */
export function useMachine() {
  const { user, serverMachine, refresh } = useSession();
  const [local, setLocal] = useState<MachineInput | null>(null);
  const [localLoaded, setLocalLoaded] = useState(false);
  const [draft, setDraft] = useState<MachineInput | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploaded = useRef(false);

  useEffect(() => { setLocal(readLocal()); setLocalLoaded(true); }, []);

  // Đăng nhập lần đầu: tài khoản chưa có máy, trình duyệt có → đưa lên
  useEffect(() => {
    if (!user || serverMachine || !local || uploaded.current) return;
    uploaded.current = true;
    api("/v1/me/machine", { method: "PUT", body: local }).then(refresh).catch(() => { uploaded.current = false; });
  }, [user, serverMachine, local, refresh]);

  const ready = localLoaded && user !== undefined;
  const stored = user ? (serverMachine ?? local) : local;
  const machine = draft ?? stored ?? SAMPLE_MACHINE;
  const isSample = !draft && !stored;

  const save = useCallback((next: MachineInput) => {
    setDraft(next);
    if (!user) {
      writeLocal(next);
      setLocal(next);
      setSaveState("saved");
      return;
    }
    // gom các thay đổi liên tiếp, lưu sau 500 ms
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api("/v1/me/machine", { method: "PUT", body: next })
        .then(() => { writeLocal(next); setSaveState("saved"); })
        .catch(() => setSaveState("error"));
    }, 500);
  }, [user]);

  return { machine, save, isSample, ready, savedTo: user ? ("account" as const) : ("browser" as const), saveState, user };
}
