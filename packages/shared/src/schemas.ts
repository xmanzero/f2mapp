import { z } from "zod";
import { findCpu, findGpu } from "./catalog";
import type { MachineConfig } from "./types";

/** Cấu hình máy do client gửi lên (tên linh kiện theo danh mục) */
export const machineInputSchema = z.object({
  cpu: z.string().min(1),
  gpu: z.string().min(1),
  ramGb: z.number().int().min(2).max(512),
  ramChannels: z.union([z.literal(1), z.literal(2)]),
  storage: z.enum(["hdd", "sata", "nvme3", "nvme4", "nvme5"]),
  pcieGen: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  psuW: z.number().int().min(200).max(2000),
  resolution: z.union([z.literal(1080), z.literal(1440), z.literal(2160)]),
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
  return {
    ...input,
    cpu: measured?.cpu ? { ...cpu, render: adjust(cpu.render, measured.cpu) } : cpu,
    gpu: measured?.gpu ? { ...gpu, render: adjust(gpu.render, measured.gpu) } : gpu,
  };
}
