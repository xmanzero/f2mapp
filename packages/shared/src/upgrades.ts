/**
 * Gợi ý nâng cấp (chưa có giá): ưu tiên việc rẻ mà hiệu quả, rồi CPU/card "vừa đủ".
 * - Nguồn thiếu, RAM kênh đơn / 8 GB, hệ điều hành trên HDD: sửa trước.
 * - CPU: khi CPU nghẽn > 15% ở màn hình đang dùng, chọn CPU yếu nhất mà hết nghẽn (≤ 10%), ưu tiên cùng socket.
 * - Card: chọn card yếu nhất cho FPS ≥ 1,4 lần hiện tại ở màn hình đang dùng.
 * Khi có giá (tin rao, giá tham khảo) sẽ xếp theo điểm tăng / giá — xem docs/scoring-spec.md §6.
 */
import { tr, type Lang } from "./lang";
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

function build(kind: UpgradeKind, title: string, reason: string, current: MachineConfig, next: MachineConfig, lang: Lang = "vi"): UpgradeSuggestion {
  const c = compareUpgrade(current, next, lang);
  return { kind, title, reason, next, powerGain: c.delta.power, fpsBefore: c.fpsBefore, fpsAfter: c.fpsAfter, warnings: c.warnings };
}

function cpuSuggestion(cfg: MachineConfig, lang: Lang): UpgradeSuggestion | null {
  const b = bottleneck(cfg);
  if (b.side !== "cpu" || b.loss <= 0.15) return null;
  // CPU nuôi được ≥ 90% FPS của card thì coi là hết nghẽn
  const enough = (cpu: (typeof CPUS)[number]) => bottleneck({ ...cfg, cpu }).loss <= 0.1 || bottleneck({ ...cfg, cpu }).side === "gpu";
  const better = CPUS.filter((c) => c.gaming > cfg.cpu.gaming).sort((a, b2) => a.gaming - b2.gaming);
  const sameSocket = better.filter((c) => c.socket === cfg.cpu.socket);
  const pick = sameSocket.find(enough) ?? better.find(enough) ?? sameSocket.at(-1);
  if (!pick) return null;
  const sameSock = pick.socket === cfg.cpu.socket;
  return build("cpu", tr(lang, `Lên ${pick.name}`, `Upgrade to ${pick.name}`),
    tr(lang, `CPU đang kìm card ${Math.round(b.loss * 100)}%. ${pick.name} là CPU yếu nhất ${sameSock ? "cùng socket " : ""}đủ nuôi ${cfg.gpu.name}.`,
      `The CPU holds the card back ${Math.round(b.loss * 100)}%. ${pick.name} is the cheapest ${sameSock ? "same-socket " : ""}CPU that can keep up with ${cfg.gpu.name}.`),
    cfg, { ...cfg, cpu: pick }, lang);
}

function gpuSuggestion(cfg: MachineConfig, lang: Lang): UpgradeSuggestion | null {
  const fps = estimateFps(cfg);
  const candidates = GPUS.filter((g) => !g.integrated && g.raster > cfg.gpu.raster)
    .map((gpu) => ({ gpu, fps: estimateFps({ ...cfg, gpu }) }))
    .filter((x) => x.fps >= fps * GPU_STEP)
    .sort((a, b) => a.gpu.raster - b.gpu.raster);
  const pick = candidates[0]?.gpu;
  if (!pick) return null;
  const next = { ...cfg, gpu: pick, psuW: cfg.psuW };
  const s = build("gpu", tr(lang, `Lên ${pick.name}`, `Upgrade to ${pick.name}`),
    tr(lang, `Card yếu nhất cho từ 1,4 lần FPS hiện tại ở màn hình của bạn.`, `The cheapest card that gives at least 1.4× your current FPS at your resolution.`), cfg, next, lang);
  const after = bottleneck(next);
  if (after.side === "cpu" && after.loss > 0.15)
    s.warnings.push({ code: "cpu_would_bound", severity: "info", message: tr(lang, `Với card mới, CPU sẽ kìm khoảng ${Math.round(after.loss * 100)}%.`, `With the new card, the CPU will hold it back about ${Math.round(after.loss * 100)}%.`) });
  return s;
}

export function suggestUpgrades(cfg: MachineConfig, lang: Lang = "vi"): UpgradeSuggestion[] {
  const out: UpgradeSuggestion[] = [];
  const need = psuNeeded(cfg);
  if (cfg.psuW < need)
    out.push(build("psu", tr(lang, `Thay nguồn ${need} W`, `Get a ${need} W PSU`), tr(lang, `Nguồn ${cfg.psuW} W thiếu cho cấu hình hiện tại.`, `A ${cfg.psuW} W PSU is too weak for this build.`), cfg, { ...cfg, psuW: need }, lang));
  if (cfg.ramChannels === 1 || cfg.ramGb <= 8) {
    const ramGb = cfg.ramGb <= 8 ? 16 : cfg.ramGb;
    out.push(build("ram", cfg.ramGb <= 8 ? tr(lang, "Lên 16 GB RAM kênh đôi", "Go to 16 GB dual-channel RAM") : tr(lang, "Lắp thêm 1 thanh RAM cho kênh đôi", "Add a second RAM stick for dual channel"),
      cfg.ramChannels === 1 ? tr(lang, "RAM kênh đơn chỉ có một nửa băng thông.", "Single-channel RAM has only half the bandwidth.") : tr(lang, `${cfg.ramGb} GB đã thiếu cho game và trình duyệt.`, `${cfg.ramGb} GB is not enough for games and browsers.`),
      cfg, { ...cfg, ramGb, ramChannels: 2 }, lang));
  }
  if (cfg.storage === "hdd")
    out.push(build("storage", tr(lang, "Chuyển hệ điều hành sang SSD", "Move the OS to an SSD"), tr(lang, "Khởi động và mở ứng dụng nhanh hơn rõ rệt.", "Much faster booting and app launches."), cfg, { ...cfg, storage: "sata" }, lang));
  const cpu = cpuSuggestion(cfg, lang);
  const gpu = gpuSuggestion(cfg, lang);
  // CPU nghẽn thì gợi ý CPU trước card
  for (const s of cpu ? [cpu, gpu] : [gpu]) if (s) out.push(s);
  return out;
}
