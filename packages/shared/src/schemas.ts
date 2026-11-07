import { z } from "zod";
import { findCpu, findGpu } from "./catalog";
import type { MachineConfig } from "./types";

/** Cấu hình máy do client gửi lên (tên linh kiện theo danh mục) */
export const machineInputSchema = z.object({
  cpu: z.string().min(1),
  gpu: z.string().min(1),
  ramGb: z.union([z.literal(8), z.literal(16), z.literal(32), z.literal(64), z.literal(128)]),
  ramChannels: z.union([z.literal(1), z.literal(2)]),
  storage: z.enum(["hdd", "sata", "nvme3", "nvme4", "nvme5"]),
  pcieGen: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  psuW: z.number().int().min(200).max(2000),
  resolution: z.union([z.literal(1080), z.literal(1440), z.literal(2160)]),
});
export type MachineInput = z.infer<typeof machineInputSchema>;

export class UnknownPartError extends Error {}

/** Đổi input (tên linh kiện) thành cấu hình đầy đủ để tính điểm */
export function resolveMachine(input: MachineInput): MachineConfig {
  const cpu = findCpu(input.cpu);
  if (!cpu) throw new UnknownPartError(`Không có CPU "${input.cpu}" trong danh mục`);
  const gpu = findGpu(input.gpu);
  if (!gpu) throw new UnknownPartError(`Không có card đồ họa "${input.gpu}" trong danh mục`);
  return { ...input, cpu, gpu };
}
