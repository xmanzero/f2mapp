/**
 * Cấu hình chi tiết của một máy: từng linh kiện người dùng sở hữu (bán được trên chợ).
 * Công thức điểm dùng dạng tóm tắt MachineInput — quy đổi bằng specToInput().
 * Phần mềm quét máy (Windows) đọc được: CPU, card, mainboard, RAM, ổ cứng (cả sức khỏe). Không đọc được nguồn.
 */
import { z } from "zod";
import { findCpu } from "./catalog";
import { SOCKET_MEMORY } from "./scoring";
import type { MachineInput } from "./schemas";
import type { Finding, PcieGen, Resolution, StorageKind } from "./types";

export type PartKind = "cpu" | "gpu" | "mainboard" | "ram" | "storage" | "psu";
export const PART_KINDS: PartKind[] = ["cpu", "gpu", "mainboard", "ram", "storage", "psu"];
export const PART_KIND_LABEL: Record<PartKind, string> = {
  cpu: "CPU", gpu: "Card đồ họa", mainboard: "Mainboard", ram: "RAM", storage: "Ổ cứng", psu: "Nguồn",
};
/** Linh kiện phần mềm quét đọc được (nguồn thì không) */
export const VERIFIABLE_KINDS: PartKind[] = ["cpu", "gpu", "mainboard", "ram", "storage"];
export const MAX_MACHINES = 2;

export type RamType = "DDR3" | "DDR4" | "DDR5";
/** DIMM = máy bàn, SO-DIMM = laptop / mini PC */
export type RamFormFactor = "dimm" | "sodimm";
export interface RamKit {
  sticks: number; perStickGb: number; type: RamType; speedMhz: number | null; model: string | null;
  formFactor: RamFormFactor;
  /** Có sửa lỗi (bus 72 bit) */
  ecc: boolean;
  /** RDIMM — RAM máy chủ, cần mainboard máy chủ / workstation */
  registered: boolean;
}
export interface Drive { interface: StorageKind; capacityGb: number; model: string | null; healthPct: number | null; isBoot: boolean }
export interface Mainboard { model: string | null; chipset: string | null; pcieGen: PcieGen }
export interface Psu { wattage: number; model: string | null; rating: string | null }

export interface MachineSpec {
  cpu: string;
  gpu: string;
  mainboard: Mainboard;
  ram: RamKit[];
  drives: Drive[];
  psu: Psu;
  resolution: Resolution;
}

const optText = (max: number) => z.string().trim().max(max).transform((s) => s || null).nullable().default(null);

export const ramKitSchema = z.object({
  sticks: z.number().int().min(1).max(8),
  perStickGb: z.number().int().refine((n) => [1, 2, 4, 8, 12, 16, 24, 32, 48, 64].includes(n), "Dung lượng mỗi thanh chưa đúng"),
  type: z.enum(["DDR3", "DDR4", "DDR5"]),
  speedMhz: z.number().int().min(800).max(12000).nullable().default(null),
  model: optText(60),
  formFactor: z.enum(["dimm", "sodimm"]).default("dimm"),
  ecc: z.boolean().default(false),
  registered: z.boolean().default(false),
}).refine((k) => !k.registered || k.ecc, { message: "RAM RDIMM luôn có ECC", path: ["ecc"] });
export const driveSchema = z.object({
  interface: z.enum(["hdd", "sata", "nvme3", "nvme4", "nvme5"]),
  capacityGb: z.number().int().min(16).max(64000),
  model: optText(60),
  healthPct: z.number().int().min(0).max(100).nullable().default(null),
  isBoot: z.boolean().default(false),
});
export const machineSpecSchema = z.object({
  cpu: z.string().min(1),
  gpu: z.string().min(1),
  mainboard: z.object({ model: optText(60), chipset: optText(20), pcieGen: z.union([z.literal(3), z.literal(4), z.literal(5)]) }),
  ram: z.array(ramKitSchema).min(1, "Khai báo ít nhất một bộ RAM").max(4),
  drives: z.array(driveSchema).min(1, "Khai báo ít nhất một ổ cứng").max(8),
  psu: z.object({ wattage: z.number().int().min(200).max(2000), model: optText(60), rating: optText(20) }),
  resolution: z.union([z.literal(1080), z.literal(1440), z.literal(2160)]),
}).refine((s) => s.ram.reduce((n, k) => n + k.sticks, 0) <= 8, { message: "Tối đa 8 thanh RAM", path: ["ram"] });

export const totalRamGb = (s: Pick<MachineSpec, "ram">) => s.ram.reduce((n, k) => n + k.sticks * k.perStickGb, 0);
export const bootDrive = (s: Pick<MachineSpec, "drives">) => s.drives.find((d) => d.isBoot) ?? s.drives[0];

/** Quy về dạng tóm tắt để tính điểm */
export function specToInput(s: MachineSpec): MachineInput {
  const sticks = s.ram.reduce((n, k) => n + k.sticks, 0);
  return {
    cpu: s.cpu, gpu: s.gpu, ramGb: Math.max(2, totalRamGb(s)), ramChannels: sticks >= 2 ? 2 : 1,
    storage: bootDrive(s)?.interface ?? "sata", pcieGen: s.mainboard.pcieGen, psuW: s.psu.wattage, resolution: s.resolution,
  };
}

/** Loại RAM đoán theo socket CPU (AM5, LGA1851 chỉ DDR5) */
export function defaultRamType(cpuName: string): RamType {
  const cpu = findCpu(cpuName);
  return cpu && SOCKET_MEMORY[cpu.socket] === "DDR5" ? "DDR5" : "DDR4";
}

/** Dựng cấu hình chi tiết từ dạng tóm tắt (máy khai báo kiểu cũ, khách chưa đăng nhập) */
export function specFromInput(m: MachineInput): MachineSpec {
  const sticks = m.ramChannels === 2 ? 2 : 1;
  const per = [1, 2, 4, 8, 12, 16, 24, 32, 48, 64].reduce((best, n) => (Math.abs(n * sticks - m.ramGb) < Math.abs(best * sticks - m.ramGb) ? n : best), 8);
  return {
    cpu: m.cpu, gpu: m.gpu,
    mainboard: { model: null, chipset: null, pcieGen: m.pcieGen },
    ram: [{ sticks, perStickGb: per, type: defaultRamType(m.cpu), speedMhz: null, model: null, formFactor: "dimm", ecc: false, registered: false }],
    drives: [{ interface: m.storage, capacityGb: m.storage === "hdd" ? 1000 : 512, model: null, healthPct: null, isBoot: true }],
    psu: { wattage: m.psuW, model: null, rating: null },
    resolution: m.resolution,
  };
}

export const STORAGE_LABEL: Record<StorageKind, string> = { hdd: "HDD", sata: "SSD SATA", nvme3: "NVMe Gen3", nvme4: "NVMe Gen4", nvme5: "NVMe Gen5" };
export const capacityLabel = (gb: number) => (gb >= 1000 ? `${(gb / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} TB` : `${gb} GB`);

/** Tên hiển thị của linh kiện (dùng cho máy và tin rao) */
export const partLabel = {
  ram: (k: RamKit) => `${k.model ? `${k.model} · ` : ""}${k.sticks > 1 ? `${k.sticks}×${k.perStickGb}` : k.perStickGb} GB ${k.type}${k.speedMhz ? ` ${k.speedMhz} MHz` : ""}`
    + `${k.registered ? " ECC RDIMM" : k.ecc ? " ECC" : ""}${k.formFactor === "sodimm" ? " SO-DIMM" : ""}`,
  drive: (d: Drive) => `${d.model ? `${d.model} · ` : ""}${STORAGE_LABEL[d.interface]} ${capacityLabel(d.capacityGb)}`,
  mainboard: (m: Mainboard) => m.model ? `${m.model}${m.chipset ? ` (${m.chipset})` : ""}` : m.chipset ? `Mainboard ${m.chipset}` : `Mainboard (khe PCIe ${m.pcieGen}.0)`,
  psu: (p: Psu) => `Nguồn ${p.wattage} W${p.model ? ` · ${p.model}` : ""}${p.rating ? ` (${p.rating})` : ""}`,
};

/**
 * Khóa nhận diện "cùng một linh kiện": khi lưu cấu hình, linh kiện cùng khóa được giữ nguyên
 * (giữ cả trạng thái xác thực); khác khóa thì linh kiện cũ thành "đã thay ra".
 * Sức khỏe ổ cứng thay đổi theo thời gian nên không nằm trong khóa.
 */
export const partKey = {
  ram: (k: RamKit) => ["ram", k.sticks, k.perStickGb, k.type, k.speedMhz ?? "", (k.model ?? "").toLowerCase(), k.formFactor ?? "dimm", !!k.ecc, !!k.registered].join("|"),
  drive: (d: Drive) => ["storage", d.interface, d.capacityGb, (d.model ?? "").toLowerCase()].join("|"),
  mainboard: (m: Mainboard) => ["mainboard", (m.model ?? "").toLowerCase(), (m.chipset ?? "").toLowerCase()].join("|"),
  psu: (p: Psu) => ["psu", p.wattage, (p.model ?? "").toLowerCase()].join("|"),
};

/**
 * Kiểm tra RAM có hợp với máy không (máy bàn). Trả về cảnh báo theo mức:
 * critical = không chạy được; warning = chạy nhưng thiệt; info = cần biết.
 */
export function ramFindings(spec: Pick<MachineSpec, "cpu" | "ram">): Finding[] {
  const out: Finding[] = [];
  const cpu = findCpu(spec.cpu);
  const mem = cpu ? SOCKET_MEMORY[cpu.socket] : null;
  const types = [...new Set(spec.ram.map((k) => k.type))];
  if (types.length > 1)
    out.push({ code: "ram_mixed_type", severity: "critical", message: `Không dùng chung ${types.join(" và ")} trên một mainboard. Giữ một loại RAM.` });
  for (const t of types)
    if (mem && mem !== "DDR4/DDR5" && t !== mem)
      out.push({ code: "ram_type_platform", severity: "critical", message: `${spec.cpu} (${cpu!.socket}) chỉ dùng ${mem}, không lắp được RAM ${t}.` });
  if (spec.ram.some((k) => k.formFactor === "sodimm"))
    out.push({ code: "ram_sodimm", severity: "critical", message: "RAM SO-DIMM là RAM laptop, không lắp được khe RAM máy bàn." });
  if (spec.ram.some((k) => k.registered))
    out.push({ code: "ram_registered", severity: "critical", message: "RAM RDIMM là RAM máy chủ, không chạy trên mainboard phổ thông." });
  else if (spec.ram.some((k) => k.ecc))
    out.push({ code: "ram_ecc", severity: "info", message: cpu?.socket.startsWith("AM")
      ? "RAM ECC chạy được trên nhiều mainboard AMD, nhưng tính năng sửa lỗi chỉ bật khi mainboard hỗ trợ."
      : "Mainboard Intel phổ thông thường không bật ECC: RAM chạy như RAM thường, hoặc không nhận. Kiểm tra trang hỗ trợ của mainboard." });
  const speeds = [...new Set(spec.ram.map((k) => k.speedMhz).filter((x): x is number => !!x))];
  if (spec.ram.length > 1 && speeds.length > 1)
    out.push({ code: "ram_mixed_speed", severity: "info", message: `Các bộ RAM khác tốc độ sẽ cùng chạy ở ${Math.min(...speeds)} MHz.` });
  return out;
}

/** Ổ cứng: sức khỏe thấp, hệ điều hành trên HDD khi có SSD */
export function driveFindings(spec: Pick<MachineSpec, "drives">): Finding[] {
  const out: Finding[] = [];
  for (const d of spec.drives)
    if (d.healthPct !== null && d.healthPct < 70)
      out.push({ code: "drive_health", severity: d.healthPct < 40 ? "critical" : "warning",
        message: `${partLabel.drive(d)} còn ${d.healthPct}% sức khỏe. Sao lưu dữ liệu quan trọng và tính chuyện thay ổ.` });
  const boot = bootDrive(spec);
  if (boot?.interface === "hdd" && spec.drives.some((d) => d.interface !== "hdd"))
    out.push({ code: "boot_on_hdd_has_ssd", severity: "warning", message: "Máy có SSD nhưng hệ điều hành đang nằm trên HDD. Cài lại Windows sang SSD để máy nhanh hơn." });
  return out;
}

/** Mọi cảnh báo từ cấu hình chi tiết */
export const specFindings = (spec: MachineSpec): Finding[] => [...ramFindings(spec), ...driveFindings(spec)];
