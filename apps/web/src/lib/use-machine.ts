"use client";

import { ANCHOR_CPU, ANCHOR_GPU, findCpu, findGpu, machineInputSchema, type MachineInput } from "@f2m/shared";
import { useCallback, useEffect, useState } from "react";

const KEY = "f2m.machine.v1";
export const SAMPLE_MACHINE: MachineInput = {
  cpu: ANCHOR_CPU, gpu: ANCHOR_GPU, ramGb: 16, ramChannels: 2, storage: "nvme3", pcieGen: 4, psuW: 550, resolution: 1080,
};

function read(): MachineInput | null {
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

/**
 * Máy của người dùng, lưu trên trình duyệt này (chưa có tài khoản).
 * `ready` = false trong lần render đầu (máy chủ chưa biết localStorage) → hiện khung chờ.
 */
export function useMachine() {
  const [machine, setMachine] = useState<MachineInput>(SAMPLE_MACHINE);
  const [isSample, setIsSample] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = read();
    if (saved) {
      setMachine(saved);
      setIsSample(false);
    }
    setReady(true);
  }, []);

  const save = useCallback((next: MachineInput) => {
    setMachine(next);
    setIsSample(false);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* trình duyệt chặn lưu: vẫn dùng được trong phiên này */
    }
  }, []);

  return { machine, save, isSample, ready };
}
