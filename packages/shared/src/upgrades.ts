/**
 * Gợi ý nâng cấp (chưa có giá): ưu tiên việc rẻ mà hiệu quả, rồi CPU/card "vừa đủ".
 * - Nguồn thiếu, RAM kênh đơn / 8 GB, hệ điều hành trên HDD: sửa trước.
 * - CPU: khi CPU nghẽn > 15% ở màn hình đang dùng, chọn CPU yếu nhất mà hết nghẽn (≤ 10%), ưu tiên cùng socket.
 * - Card: chọn card yếu nhất cho FPS ≥ 1,4 lần hiện tại ở màn hình đang dùng.
 * Khi có giá (tin rao, giá tham khảo) sẽ xếp theo điểm tăng / giá — xem docs/scoring-spec.md §6.
 */
import { CPUS, GPUS } from "./catalog";
import { bottleneck, compareUpgrade, estimateFps, psuNeeded } from "./scoring";
import type { Finding, MachineConfig } from "./types";

export type UpgradeKind = "psu" | "ram" | "storage" | "cpu" | "gpu";

export interface UpgradeSuggestion {
  kind: UpgradeKind;
  title: string;
  reason: string;
  next: MachineConfig;
  /** Thay đổi điểm sức mạnh, 0.12 = +12% */
  powerGain: number;
  fpsBefore: number;
  fpsAfter: number;
  warnings: Finding[];
}

const GPU_STEP = 1.4;

function build(kind: UpgradeKind, title: string, reason: string, current: MachineConfig, next: MachineConfig): UpgradeSuggestion {
  const c = compareUpgrade(current, next);
  return { kind, title, reason, next, powerGain: c.delta.power, fpsBefore: c.fpsBefore, fpsAfter: c.fpsAfter, warnings: c.warnings };
}

function cpuSuggestion(cfg: MachineConfig): UpgradeSuggestion | null {
  const b = bottleneck(cfg);
  if (b.side !== "cpu" || b.loss <= 0.15) return null;
  // CPU nuôi được ≥ 90% FPS của card thì coi là hết nghẽn
  const enough = (cpu: (typeof CPUS)[number]) => bottleneck({ ...cfg, cpu }).loss <= 0.1 || bottleneck({ ...cfg, cpu }).side === "gpu";
  const better = CPUS.filter((c) => c.gaming > cfg.cpu.gaming).sort((a, b2) => a.gaming - b2.gaming);
  const sameSocket = better.filter((c) => c.socket === cfg.cpu.socket);
  const pick = sameSocket.find(enough) ?? better.find(enough) ?? sameSocket.at(-1);
  if (!pick) return null;
  const sameSock = pick.socket === cfg.cpu.socket;
  return build("cpu", `Lên ${pick.name}`,
    `CPU đang kìm card ${Math.round(b.loss * 100)}%. ${pick.name} là CPU yếu nhất ${sameSock ? "cùng socket " : ""}đủ nuôi ${cfg.gpu.name}.`,
    cfg, { ...cfg, cpu: pick });
}

function gpuSuggestion(cfg: MachineConfig): UpgradeSuggestion | null {
  const fps = estimateFps(cfg);
  const candidates = GPUS.filter((g) => !g.integrated && g.raster > cfg.gpu.raster)
    .map((gpu) => ({ gpu, fps: estimateFps({ ...cfg, gpu }) }))
    .filter((x) => x.fps >= fps * GPU_STEP)
    .sort((a, b) => a.gpu.raster - b.gpu.raster);
  const pick = candidates[0]?.gpu;
  if (!pick) return null;
  const next = { ...cfg, gpu: pick, psuW: cfg.psuW };
  const s = build("gpu", `Lên ${pick.name}`,
    `Card yếu nhất cho từ 1,4 lần FPS hiện tại ở màn hình của bạn.`, cfg, next);
  const after = bottleneck(next);
  if (after.side === "cpu" && after.loss > 0.15)
    s.warnings.push({ code: "cpu_would_bound", severity: "info", message: `Với card mới, CPU sẽ kìm khoảng ${Math.round(after.loss * 100)}%.` });
  return s;
}

export function suggestUpgrades(cfg: MachineConfig): UpgradeSuggestion[] {
  const out: UpgradeSuggestion[] = [];
  const need = psuNeeded(cfg);
  if (cfg.psuW < need)
    out.push(build("psu", `Thay nguồn ${need} W`, `Nguồn ${cfg.psuW} W thiếu cho cấu hình hiện tại.`, cfg, { ...cfg, psuW: need }));
  if (cfg.ramChannels === 1 || cfg.ramGb <= 8) {
    const ramGb = cfg.ramGb <= 8 ? 16 : cfg.ramGb;
    out.push(build("ram", cfg.ramGb <= 8 ? "Lên 16 GB RAM kênh đôi" : "Lắp thêm 1 thanh RAM cho kênh đôi",
      cfg.ramChannels === 1 ? "RAM kênh đơn chỉ có một nửa băng thông." : `${cfg.ramGb} GB đã thiếu cho game và trình duyệt.`,
      cfg, { ...cfg, ramGb, ramChannels: 2 }));
  }
  if (cfg.storage === "hdd")
    out.push(build("storage", "Chuyển hệ điều hành sang SSD", "Khởi động và mở ứng dụng nhanh hơn rõ rệt.", cfg, { ...cfg, storage: "sata" }));
  const cpu = cpuSuggestion(cfg);
  const gpu = gpuSuggestion(cfg);
  // CPU nghẽn thì gợi ý CPU trước card
  for (const s of cpu ? [cpu, gpu] : [gpu]) if (s) out.push(s);
  return out;
}
