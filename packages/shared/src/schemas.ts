import { z } from "zod";
import { findCpu, findGpu } from "./catalog";
import type { Gpu, MachineConfig } from "./types";

/** Cấu hình máy do client gửi lên (tên linh kiện theo danh mục) */
export const machineInputSchema = z.object({
  cpu: z.string().min(1),
  gpu: z.string().min(1),
  ramGb: z.number().int().min(2).max(512),
  ramChannels: z.union([z.literal(1), z.literal(2)]),
  storage: z.enum(["hdd", "sata", "nvme3", "nvme4", "nvme5"]),
  pcieGen: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  /** Nguồn máy bàn, hoặc sạc laptop (W) */
  psuW: z.number().int().min(30).max(2000),
  resolution: z.union([z.literal(1080), z.literal(1440), z.literal(2160)]),
  /** Laptop: chấm nguyên chiếc */
  laptop: z.boolean().optional(),
  /** TGP thực tế của card laptop (W) */
  gpuTgpW: z.number().int().min(10).max(250).optional(),
});
export type MachineInput = z.infer<typeof machineInputSchema>;

export class UnknownPartError extends Error {}

/** Điểm render đo thật (Blender Benchmark đã xác minh) của CPU / card trong máy — không nhận từ client */
export interface MeasuredRender { cpu?: number; gpu?: number }
/** Số đo kéo điểm render lệch tối đa ±25% so với danh mục (giới hạn thiệt hại nếu số đo vẫn bị làm giả) */
const MAX_ADJUST = 0.25;
const adjust = (catalog: number, measured?: number) =>
  measured ? Math.round(Math.min(catalog * (1 + MAX_ADJUST), Math.max(catalog * (1 - MAX_ADJUST), measured))) : catalog;

/**
 * Đổi input (tên linh kiện) thành cấu hình đầy đủ để tính điểm.
 * measured: điểm render đo thật của chính máy này → thay điểm render trung bình của mẫu (điểm Đồ họa theo máy thật).
 */
export function resolveMachine(input: MachineInput, measured?: MeasuredRender): MachineConfig {
  const cpu = findCpu(input.cpu);
  if (!cpu) throw new UnknownPartError(`Không có CPU "${input.cpu}" trong danh mục`);
  const gpu = findGpu(input.gpu);
  if (!gpu) throw new UnknownPartError(`Không có card đồ họa "${input.gpu}" trong danh mục`);
  const g = withTgp(gpu, input.gpuTgpW);
  return {
    ...input,
    laptop: !!(input.laptop || cpu.mobile || gpu.mobile),
    cpu: measured?.cpu ? { ...cpu, render: adjust(cpu.render, measured.cpu) } : cpu,
    gpu: measured?.gpu ? { ...g, render: adjust(g.render, measured.gpu) } : g,
  };
}

/** Hệ số hiệu năng card laptop theo TGP (so với TGP tối đa của mẫu) */
export const TGP_EXP = 0.4;
export function tgpFactor(gpu: Gpu, tgpW?: number | null) {
  if (!gpu.tgp || !tgpW) return 1;
  const t = Math.min(gpu.tgp.max, Math.max(gpu.tgp.min, tgpW));
  return (t / gpu.tgp.max) ** TGP_EXP;
}
/**
 * Card laptop chạy ở TGP thấp hơn mức tối đa: FPS, điểm game, ray tracing giảm theo tgpFactor.
 * Điểm render (Blender) là trung vị máy thật — coi như ở TGP phổ biến, chỉnh theo tỉ lệ so với mức đó.
 */
function withTgp(gpu: Gpu, tgpW?: number): Gpu {
  if (!gpu.tgp || !tgpW) return gpu;
  const f = tgpFactor(gpu, tgpW);
  const fr = f / tgpFactor(gpu, gpu.tgp.default);
  const k = (n: number) => Math.round(n * f * 10) / 10;
  return {
    ...gpu,
    fps: { "1080": k(gpu.fps["1080"]), "1440": k(gpu.fps["1440"]), "2160": k(gpu.fps["2160"]) },
    raster: Math.round(gpu.raster * f), rayTracing: gpu.rayTracing === null ? null : Math.round(gpu.rayTracing * f),
    render: Math.round(gpu.render * fr), boardPowerW: Math.min(gpu.tgp.max, Math.max(gpu.tgp.min, tgpW)),
  };
}
