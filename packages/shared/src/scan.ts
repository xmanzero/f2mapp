/**
 * Kết quả quét máy từ phần mềm f2m-scan (Windows): dữ liệu thô đọc từ WMI / registry / PCI,
 * và cách quy về cấu hình chi tiết (MachineSpec) theo danh mục của app.
 * Phần mềm quét chỉ gửi dữ liệu thô — mọi luật nhận diện nằm ở đây để sửa một chỗ, không phải phát hành lại phần mềm.
 */
import { z } from "zod";
import { CPUS, GPUS } from "./catalog";
import type { Drive, Mainboard, MachineSpec, PartKind, RamKit, RamType } from "./spec";
import type { PcieGen, Resolution, StorageKind } from "./types";

// ---------- dữ liệu thô ----------
const text = (max: number) => z.string().max(max).transform((s) => s.replace(/\s+/g, " ").trim());
const optNum = z.number().finite().nullable().optional().transform((n) => n ?? null);

/** Số đo Blender Benchmark của một thiết bị: samples_per_minute từng cảnh (đọc từ `benchmark-launcher-cli benchmark --json`) */
const spm = z.number().finite().positive().max(1e6);
const benchDeviceSchema = z.object({
  /** Tên thiết bị Blender báo (VD "Intel Core i7-14700", "NVIDIA GeForce RTX 3060") */
  name: text(120),
  /** CPU, OPTIX (NVIDIA), HIP (AMD), ONEAPI (Intel), CUDA */
  type: text(16),
  scenes: z.object({ monster: spm, junkshop: spm, classroom: spm }),
});
export const benchReportSchema = z.object({
  /** Phiên bản Blender đã chạy (VD "4.5.0") */
  blender: text(20),
  launcher: text(20).optional(),
  cpu: benchDeviceSchema.optional(),
  gpu: benchDeviceSchema.optional(),
});
export type BenchReport = z.infer<typeof benchReportSchema>;

export const scanReportSchema = z.object({
  tool: text(40),
  os: text(120).optional(),
  cpu: z.object({ name: text(120), cores: optNum, threads: optNum }),
  gpus: z.array(z.object({
    name: text(120),
    /** Byte, đọc từ registry (qwMemorySize) — AdapterRAM của WMI tối đa 4 GB nên không dùng */
    vramBytes: optNum,
    /** Thế hệ PCIe tối đa của card (1–5), nếu đọc được */
    pcieGen: optNum,
  })).max(8),
  board: z.object({ manufacturer: text(80), product: text(80) }),
  ram: z.array(z.object({
    capacityBytes: z.number().nonnegative(),
    /** MHz theo cách gọi thông thường (3200, 6000) */
    speedMhz: optNum,
    /** SMBIOSMemoryType: 24 = DDR3, 26 = DDR4, 34 = DDR5 */
    smbiosType: optNum,
    /** FormFactor của WMI: 8 = DIMM, 12 = SO-DIMM */
    formFactor: optNum,
    manufacturer: text(60).optional(),
    partNumber: text(60).optional(),
    dataWidth: optNum,
    totalWidth: optNum,
  })).max(16),
  disks: z.array(z.object({
    model: text(120),
    sizeBytes: z.number().nonnegative(),
    /** BusType của MSFT_PhysicalDisk: 11 = SATA, 17 = NVMe, 7 = USB… */
    busType: optNum,
    /** MediaType: 3 = HDD, 4 = SSD */
    mediaType: optNum,
    isBoot: z.boolean().optional().default(false),
    /** 100 − Wear (cần quyền quản trị, thường không có) */
    healthPct: optNum,
    pcieGen: optNum,
  })).max(16),
  display: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).nullable().optional().transform((d) => d ?? null),
  /** Đo hiệu năng (tùy chọn, người dùng bấm "Đo hiệu năng" trong phần mềm) */
  bench: benchReportSchema.nullable().optional().transform((b) => b ?? null),
});
export type ScanReport = z.infer<typeof scanReportSchema>;

// ---------- nhận diện CPU / card ----------
const fold = (s: string) => s.toLowerCase()
  .replace(/\((r|tm|c)\)|®|™/g, " ")
  .replace(/\b(\d+(st|nd|rd|th) gen|intel|amd|nvidia|geforce|radeon|processor|graphics|cpu|with|\d+-core|\d+ cores?)\b/g, " ")
  .replace(/@.*$/, " ")
  .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
/** Tên trong danh mục, bỏ đuôi dung lượng VRAM ("RTX 3060 12GB" → "rtx 3060") */
const baseOf = (name: string) => fold(name.replace(/\b\d+\s?GB\b/i, ""));

export interface PartMatch {
  /** Tên trong danh mục nếu nhận ra chắc chắn */
  name: string | null;
  /** Tên đọc từ máy (để hiện và để bổ sung danh mục) */
  raw: string;
  /** Gợi ý gần nhất khi chưa có trong danh mục */
  suggestion: string | null;
  /** Khớp theo mẫu tương đương (VD i5-14600KF → i5-14600K: cùng hiệu năng, chỉ khác có / không có iGPU) */
  equivalent?: boolean;
}

/** Gợi ý: tên trong danh mục có nhiều từ đầu trùng nhất (gtx 1660 ti → GTX 1660 Super; i7-14700 → i7-14700K) */
function closest(q: string, names: string[]) {
  const qt = q.split(" ");
  let best: string | null = null, score = 0;
  for (const n of names) {
    const t = baseOf(n).split(" ");
    let k = 0;
    while (k < qt.length && k < t.length && qt[k] === t[k]) k++;
    // trùng một phần ở từ cuối (14700 ~ 14700k) cũng tính nửa điểm
    const partial = k < qt.length && k < t.length && (t[k] ?? "").startsWith((qt[k] ?? "").slice(0, 4)) ? 0.5 : 0;
    if (k + partial > score) { score = k + partial; best = n; }
  }
  return score >= 1.5 ? best : null;
}

export function matchCpu(raw: string): PartMatch {
  const q = fold(raw);
  const exact = CPUS.find((c) => baseOf(c.name) === q);
  if (exact) return { name: exact.name, raw, suggestion: null };
  // KF → K: cùng nhân, cùng xung, chỉ không có iGPU
  if (/kf$/.test(q)) {
    const k = CPUS.find((c) => baseOf(c.name) === q.slice(0, -1));
    if (k) return { name: k.name, raw, suggestion: null, equivalent: true };
  }
  return { name: null, raw, suggestion: closest(q, CPUS.map((c) => c.name)) };
}

const isIntegrated = (raw: string) => {
  const f = fold(raw);
  return /\b(uhd|iris|hd \d{3,4}|vega \d+)\b/.test(f) || /^(\d{3}m|arc)$/.test(f) || f === "" || /^(microsoft basic|parsec|virtual)/i.test(raw);
};

export function matchGpu(raw: string, vramGb: number | null): PartMatch {
  if (isIntegrated(raw)) return { name: GPUS.find((g) => g.integrated)?.name ?? null, raw, suggestion: null };
  const q = fold(raw);
  const same = GPUS.filter((g) => !g.integrated && baseOf(g.name) === q);
  if (same.length === 1 && same[0]) return { name: same[0].name, raw, suggestion: null };
  if (same.length > 1) {
    // cùng tên khác VRAM (RTX 3060 8/12GB, 4060 Ti 8/16GB): chọn theo VRAM đọc được
    const pick = vramGb ? same.reduce((a, b) => Math.abs(b.vramGb - vramGb) < Math.abs(a.vramGb - vramGb) ? b : a) : null;
    if (pick && Math.abs(pick.vramGb - (vramGb ?? 0)) <= 1) return { name: pick.name, raw, suggestion: null };
    return { name: null, raw, suggestion: same[0]?.name ?? null };
  }
  return { name: null, raw, suggestion: closest(q, GPUS.filter((g) => !g.integrated).map((g) => g.name)) };
}

/** Card chính: card rời có VRAM lớn nhất, không có thì đồ họa tích hợp */
export function primaryGpu(gpus: ScanReport["gpus"]) {
  const real = gpus.filter((g) => !/^(microsoft basic|parsec|virtual|meta|oray|citrix)/i.test(g.name));
  const discrete = real.filter((g) => !isIntegrated(g.name));
  const pool = discrete.length ? discrete : real;
  return pool.sort((a, b) => (b.vramBytes ?? 0) - (a.vramBytes ?? 0))[0] ?? null;
}

// ---------- mainboard ----------
const BOARD_BRAND: [RegExp, string][] = [
  [/asustek|^asus/i, "ASUS"], [/micro-star|^msi/i, "MSI"], [/gigabyte/i, "Gigabyte"], [/asrock/i, "ASRock"],
  [/biostar/i, "Biostar"], [/colorful/i, "Colorful"], [/^evga/i, "EVGA"], [/^nzxt/i, "NZXT"],
];
export function chipsetOf(product: string): string | null {
  const m = product.toUpperCase().match(/\b([ABHQXZW]\d{3}E?)(?=[A-Z0-9-]*\b)/);
  return m?.[1] ?? null;
}
/**
 * Thế hệ PCIe của khe card chính theo chipset. Chỗ nào hãng làm khác nhau (Z690, B650, X670) lấy mức thấp hơn,
 * người dùng sửa được ở trang cấu hình.
 */
export function pcieGenOfChipset(chipset: string | null): PcieGen | null {
  if (!chipset) return null;
  const c = chipset.toUpperCase();
  if (/^(X870E?|X670E|B650E|Z790|Z890|B860|H870|W880)$/.test(c)) return 5;
  if (/^(B550|X570|A620|B650|X670|B840|B850|H510|B560|H570|Z590|W580|H610|B660|H670|Z690|H770|B760|W680|W790)$/.test(c)) return 4;
  if (/^(A320|B350|X370|B450|X470|A520|H310|B360|B365|H370|Z370|Z390|H410|B460|H470|Z490|W480)$/.test(c)) return 3;
  return null;
}
export function mainboardFrom(b: ScanReport["board"]): Mainboard & { pcieKnown: boolean } {
  const brand = BOARD_BRAND.find(([re]) => re.test(b.manufacturer))?.[1] ?? b.manufacturer.split(" ")[0];
  const product = b.product.trim();
  const generic = !product || /^(to be filled|default string|system product|base board|not applicable)/i.test(product);
  const chipset = generic ? null : chipsetOf(product);
  const gen = pcieGenOfChipset(chipset);
  return {
    model: generic ? null : `${brand && !product.toUpperCase().startsWith(brand.toUpperCase()) ? `${brand} ` : ""}${product}`.slice(0, 60),
    chipset, pcieGen: gen ?? 4, pcieKnown: gen !== null,
  };
}

// ---------- RAM ----------
const RAM_TYPE: Record<number, RamType> = { 24: "DDR3", 26: "DDR4", 34: "DDR5" };
const STICK_GB = [1, 2, 4, 8, 12, 16, 24, 32, 48, 64];
/** Gom các thanh giống nhau thành bộ (2 thanh 8 GB cùng loại = một bộ 2×8) */
export function ramKitsFrom(mods: ScanReport["ram"], hintType: RamType | null): RamKit[] {
  const kits = new Map<string, RamKit>();
  for (const m of mods) {
    const gb = Math.round(m.capacityBytes / 2 ** 30);
    if (!STICK_GB.includes(gb)) continue;
    const type = (m.smbiosType && RAM_TYPE[m.smbiosType]) || hintType || "DDR4";
    const speed = m.speedMhz && m.speedMhz >= 800 && m.speedMhz <= 12000 ? Math.round(m.speedMhz) : null;
    const model = (m.partNumber ?? "").trim() || null;
    const ecc = !!(m.totalWidth && m.dataWidth && m.totalWidth > m.dataWidth);
    const formFactor = m.formFactor === 12 ? "sodimm" : "dimm";
    const key = [gb, type, speed, model, ecc, formFactor].join("|");
    const k = kits.get(key);
    if (k) k.sticks++;
    else kits.set(key, { sticks: 1, perStickGb: gb, type, speedMhz: speed, model: model?.slice(0, 60) ?? null, formFactor, ecc, registered: false });
  }
  return [...kits.values()].slice(0, 4);
}

// ---------- ổ cứng ----------
/** Bỏ ổ USB, thẻ nhớ, ổ ảo */
const INTERNAL_BUS = new Set([1, 3, 8, 10, 11, 17, 18]); // SCSI, ATA, RAID, SAS, SATA, NVMe, SCM
export function drivesFrom(disks: ScanReport["disks"]): Drive[] {
  const out: Drive[] = [];
  for (const d of disks) {
    if (d.busType != null && !INTERNAL_BUS.has(d.busType)) continue;
    const gb = Math.round(d.sizeBytes / 1e9);
    if (gb < 16) continue;
    let iface: StorageKind;
    if (d.busType === 17 || /nvme/i.test(d.model)) iface = d.pcieGen && d.pcieGen >= 5 ? "nvme5" : d.pcieGen && d.pcieGen <= 3 ? "nvme3" : d.pcieGen === 4 ? "nvme4" : "nvme3";
    else iface = d.mediaType === 3 ? "hdd" : "sata";
    out.push({
      interface: iface, capacityGb: Math.min(gb, 64000), model: d.model.replace(/\s+/g, " ").trim().slice(0, 60) || null,
      healthPct: d.healthPct != null ? Math.max(0, Math.min(100, Math.round(d.healthPct))) : null, isBoot: !!d.isBoot,
    });
  }
  if (out[0] && !out.some((d) => d.isBoot)) out[0].isBoot = true;
  return out.slice(0, 8);
}

export function resolutionOf(display: ScanReport["display"]): Resolution {
  if (!display) return 1080;
  const short = Math.min(display.width, display.height);
  return short >= 2000 ? 2160 : short >= 1400 ? 1440 : 1080;
}

// ---------- tổng hợp ----------
export interface ScanResult {
  cpu: PartMatch;
  gpu: PartMatch & { vramGb: number | null };
  mainboard: Mainboard & { pcieKnown: boolean; raw: string };
  ram: RamKit[];
  drives: Drive[];
  resolution: Resolution;
  display: string | null;
  /** Phần mềm chạy được nhưng có chỗ chưa chắc — hiện cho người dùng */
  notes: string[];
  /** Kết quả đo hiệu năng (bản quét cũ không có trường này) */
  bench?: BenchResult | null;
}

// ---------- đo hiệu năng (Blender Benchmark) ----------
/** Phiên bản Blender dùng để đo — phải trùng dữ liệu so sánh (data/blender-render-4.5.json) */
export const BENCH_BLENDER = "4.5.0";
export const BENCH_SCENES = ["monster", "junkshop", "classroom"] as const;
/**
 * Điểm Blender (tổng trung vị samples_per_minute 3 cảnh) của mốc 10.000 điểm render:
 * CPU = Core i5-12400F, card = RTX 3060. Lấy từ data/blender-render-4.5.json (test kiểm tra khớp).
 */
export const BLENDER_REF = { cpu: 155.74156713789637, gpu: 2155.3024287254093 } as const;
/** API card có trong dữ liệu so sánh (NVIDIA đo bằng OptiX, AMD bằng HIP, Intel bằng oneAPI) */
const COMPARABLE_GPU_API = new Set(["OPTIX", "HIP", "ONEAPI"]);

export interface BenchDevice {
  /** Tên Blender báo */
  raw: string;
  /** Tên trong danh mục (null nếu chưa có) */
  part: string | null;
  type: string;
  /** Điểm Blender: tổng samples_per_minute 3 cảnh */
  score: number;
  /** Quy về thang render của app (mốc 12400F / RTX 3060 = 10.000) */
  points: number;
  /** Điểm render trung bình của mẫu này trong danh mục */
  expected: number | null;
  /** points / expected (%) */
  pct: number | null;
}
export interface BenchResult { blender: string; cpu: BenchDevice | null; gpu: BenchDevice | null }

const noVram = (n: string) => n.replace(/\s*\d+\s?GB$/i, "");

/**
 * Đối chiếu số đo với linh kiện đã nhận ra: chỉ nhận số đo của đúng CPU / card chính trong bản quét,
 * đúng phiên bản Blender của dữ liệu so sánh.
 */
export function interpretBench(b: BenchReport | null | undefined, cpu: PartMatch, gpu: PartMatch & { vramGb: number | null }): BenchResult | null {
  if (!b || b.blender !== BENCH_BLENDER) return null;
  const device = (d: BenchReport["cpu"], kind: "cpu" | "gpu"): BenchDevice | null => {
    if (!d) return null;
    if (kind === "cpu" ? d.type !== "CPU" : d.type === "CPU") return null;
    const m = kind === "cpu" ? matchCpu(d.name) : matchGpu(d.name, gpu.vramGb);
    const mine = kind === "cpu" ? cpu.name : gpu.name;
    // số đo của thiết bị khác (card phụ, CPU khác) → bỏ
    if (mine && (!m.name || noVram(m.name) !== noVram(mine))) return null;
    const part = mine ?? null;
    const score = BENCH_SCENES.reduce((t, k) => t + d.scenes[k], 0);
    const points = Math.round(score / BLENDER_REF[kind] * 10000);
    const info = part ? (kind === "cpu" ? CPUS.find((c) => c.name === part) : GPUS.find((g) => g.name === part)) : undefined;
    const comparable = kind === "cpu" || COMPARABLE_GPU_API.has(d.type);
    const expected = info && comparable ? info.render : null;
    return { raw: d.name, part, type: d.type, score: Math.round(score * 10) / 10, points, expected, pct: expected ? Math.round(points / expected * 100) : null };
  };
  const out = { blender: b.blender, cpu: device(b.cpu, "cpu"), gpu: device(b.gpu, "gpu") };
  return out.cpu || out.gpu ? out : null;
}

/** Phần đo còn đúng với cấu hình hiện tại (đổi CPU / card sau khi đo thì số đo cũ không còn giá trị) */
export function benchForSpec(b: (BenchResult & { at?: string | Date }) | null | undefined, spec: { cpu: string; gpu: string }) {
  if (!b) return null;
  const cpu = b.cpu && b.cpu.part === spec.cpu ? b.cpu : null;
  const gpu = b.gpu && b.gpu.part === spec.gpu ? b.gpu : null;
  return cpu || gpu ? { ...b, cpu, gpu } : null;
}

export function interpretScan(r: ScanReport): ScanResult {
  const notes: string[] = [];
  const cpu = matchCpu(r.cpu.name);
  const g = primaryGpu(r.gpus);
  const vramGb = g?.vramBytes ? Math.round(g.vramBytes / 2 ** 30) : null;
  const gpu = { ...(g ? matchGpu(g.name, vramGb) : { name: GPUS.find((x) => x.integrated)?.name ?? null, raw: "Không thấy card", suggestion: null }), vramGb };
  const mb = mainboardFrom(r.board);
  if (!mb.pcieKnown) notes.push("Chưa nhận ra chipset mainboard, tạm tính khe card PCIe 4.0 — sửa lại ở trang cấu hình nếu sai.");
  const cpuInfo = cpu.name ? CPUS.find((c) => c.name === cpu.name) : undefined;
  const hint: RamType | null = cpuInfo?.socket === "AM5" || cpuInfo?.socket === "LGA1851" ? "DDR5" : null;
  const ram = ramKitsFrom(r.ram, hint);
  if (!ram.length) notes.push("Không đọc được RAM.");
  const drives = drivesFrom(r.disks);
  if (!drives.length) notes.push("Không đọc được ổ cứng.");
  if (r.disks.some((d) => (d.busType === 17) && !d.pcieGen)) notes.push("Chưa đọc được thế hệ PCIe của ổ NVMe, tạm ghi Gen3.");
  return {
    cpu, gpu, mainboard: { ...mb, raw: `${r.board.manufacturer} ${r.board.product}`.trim() }, ram, drives,
    resolution: resolutionOf(r.display), display: r.display ? `${r.display.width}×${r.display.height}` : null, notes,
    bench: interpretBench(r.bench, cpu, gpu),
  };
}

/** Ghép kết quả quét với phần người dùng chọn / phần không quét được (nguồn) thành cấu hình đầy đủ */
export function specFromScan(s: ScanResult, pick: { cpu: string; gpu: string; psu: MachineSpec["psu"] }): MachineSpec {
  const { pcieKnown: _k, raw: _r, ...mainboard } = s.mainboard;
  return {
    cpu: pick.cpu, gpu: pick.gpu, mainboard,
    ram: s.ram.length ? s.ram : [{ sticks: 2, perStickGb: 8, type: "DDR4", speedMhz: null, model: null, formFactor: "dimm", ecc: false, registered: false }],
    drives: s.drives.length ? s.drives : [{ interface: "nvme3", capacityGb: 512, model: null, healthPct: null, isBoot: true }],
    psu: pick.psu, resolution: s.resolution,
  };
}

/**
 * "Có phải cùng linh kiện không" khi cập nhật máy theo kết quả quét — lỏng hơn partKey:
 * lần quét đọc được thêm chi tiết (tốc độ RAM, model ổ…) mà người dùng chưa khai thì vẫn là linh kiện cũ.
 */
export function sameScannedPart(kind: PartKind, had: unknown, now: unknown, hadLabel: string, nowLabel: string): boolean {
  const a = had as never, b = now as never;
  const fill = (x: string | null | undefined, y: string | null | undefined) => !x || !y || fold(x) === fold(y) || fold(x).includes(fold(y)) || fold(y).includes(fold(x));
  switch (kind) {
    case "cpu": case "gpu": return hadLabel === nowLabel;
    case "ram": {
      const x = a as RamKit, y = b as RamKit;
      return x.sticks === y.sticks && x.perStickGb === y.perStickGb && x.type === y.type && (!x.speedMhz || !y.speedMhz || x.speedMhz === y.speedMhz) && fill(x.model, y.model);
    }
    case "storage": {
      const x = a as Drive, y = b as Drive;
      const fam = (i: StorageKind) => (i.startsWith("nvme") ? "nvme" : i);
      return fam(x.interface) === fam(y.interface) && Math.abs(x.capacityGb - y.capacityGb) <= Math.max(8, y.capacityGb * 0.03) && fill(x.model, y.model);
    }
    case "mainboard": {
      const x = a as Mainboard, y = b as Mainboard;
      return (!x.chipset || !y.chipset || x.chipset.toUpperCase() === y.chipset.toUpperCase()) && fill(x.model, y.model) && !!(x.model || x.chipset);
    }
    case "psu": return false;
  }
}
