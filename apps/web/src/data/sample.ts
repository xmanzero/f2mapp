/**
 * DỮ LIỆU MẪU — để xem giao diện khi chưa có người dùng thật. Thay bằng dữ liệu từ API trước khi ra mắt.
 * Người dùng và tin rao đều là giả lập; giá đồ cũ là mức tham khảo ước tính (11/2026).
 */
import type { MachineInput } from "@f2m/shared";

export interface SampleMachine { handle: string; province: string; machine: MachineInput }
const m = (cpu: string, gpu: string, ramGb: MachineInput["ramGb"], resolution: MachineInput["resolution"], extra: Partial<MachineInput> = {}): MachineInput =>
  ({ cpu, gpu, ramGb, ramChannels: 2, storage: "nvme4", pcieGen: 4, psuW: 850, resolution, ...extra });

export const SAMPLE_MACHINES: SampleMachine[] = [
  { handle: "khoa.render", province: "TP.HCM", machine: m("Ryzen 9 9950X3D", "RTX 5090", 64, 2160, { storage: "nvme5", pcieGen: 5, psuW: 1200 }) },
  { handle: "tuan_4k", province: "Hà Nội", machine: m("Ryzen 7 9800X3D", "RTX 4090", 32, 2160, { psuW: 1000 }) },
  { handle: "minhthu.rig", province: "Đà Nẵng", machine: m("Core i7-14700K", "RTX 5080", 32, 1440, { psuW: 1000 }) },
  { handle: "longdz99", province: "Hà Nội", machine: m("Ryzen 7 7800X3D", "RX 9070 XT", 32, 1440) },
  { handle: "hai.streamer", province: "Hải Phòng", machine: m("Core Ultra 7 265K", "RTX 5070 Ti", 32, 1440) },
  { handle: "phuc.lab", province: "Cần Thơ", machine: m("Core i5-14600K", "RTX 4070 Super", 32, 1440, { psuW: 750 }) },
  { handle: "ngocanh_pc", province: "TP.HCM", machine: m("Ryzen 5 9600X", "RTX 5070", 32, 1440, { psuW: 750 }) },
  { handle: "quang.edit", province: "Huế", machine: m("Ryzen 9 7950X", "RTX 4070", 64, 1440, { psuW: 850 }) },
  { handle: "datvaco", province: "Bắc Ninh", machine: m("Ryzen 5 7500F", "RTX 5060 Ti 16GB", 32, 1440, { psuW: 650 }) },
  { handle: "thanh.bao", province: "Nghệ An", machine: m("Core i5-13400F", "RTX 4060 Ti 8GB", 16, 1080, { psuW: 650 }) },
  { handle: "vy.creative", province: "TP.HCM", machine: m("Ryzen 7 5700X", "RX 7800 XT", 32, 1440, { pcieGen: 4, psuW: 750 }) },
  { handle: "son.gaming", province: "Hà Nội", machine: m("Core i5-12400F", "RTX 4060", 16, 1080, { storage: "nvme3", psuW: 550 }) },
  { handle: "hoang.cs2", province: "Quảng Ninh", machine: m("Ryzen 5 5600", "RTX 3060 Ti", 16, 1080, { storage: "nvme3", psuW: 650 }) },
  { handle: "linh.sv", province: "Thái Nguyên", machine: m("Core i3-12100F", "RX 6600", 16, 1080, { storage: "nvme3", psuW: 550 }) },
  { handle: "trung.lienminh", province: "Đồng Nai", machine: m("Ryzen 5 3600", "GTX 1660 Super", 16, 1080, { storage: "sata", pcieGen: 3, psuW: 550 }) },
  { handle: "bac.van", province: "Ninh Bình", machine: m("Core i5-10400F", "GTX 1650", 8, 1080, { ramChannels: 1, storage: "sata", pcieGen: 3, psuW: 450 }) },
  { handle: "chu.tieu", province: "TP.HCM", machine: m("Core i3-10100", "Đồ họa tích hợp (iGPU)", 8, 1080, { ramChannels: 1, storage: "hdd", pcieGen: 3, psuW: 300 }) },
];

export type ListingKind = "gpu" | "cpu" | "ram" | "storage";
export interface SampleListing {
  id: string; kind: ListingKind;
  /** Tên trong danh mục (gpu/cpu) hoặc mô tả (ram/ổ) */
  part: string;
  priceVnd: number; condition: "like_new" | "used"; warrantyMonths: number;
  province: string; seller: string; daysAgo: number;
}
export const CONDITION_LABEL = { like_new: "Như mới", used: "Đã dùng" } as const;

export const SAMPLE_LISTINGS: SampleListing[] = [
  { id: "l1", kind: "gpu", part: "RTX 3060 12GB", priceVnd: 4_300_000, condition: "used", warrantyMonths: 0, province: "Hà Nội", seller: "son.gaming", daysAgo: 0 },
  { id: "l2", kind: "gpu", part: "RX 6600", priceVnd: 2_900_000, condition: "used", warrantyMonths: 2, province: "TP.HCM", seller: "vy.creative", daysAgo: 1 },
  { id: "l3", kind: "gpu", part: "RTX 3070", priceVnd: 5_900_000, condition: "used", warrantyMonths: 0, province: "Đà Nẵng", seller: "minhthu.rig", daysAgo: 1 },
  { id: "l4", kind: "gpu", part: "RTX 4060", priceVnd: 5_600_000, condition: "like_new", warrantyMonths: 18, province: "Hải Phòng", seller: "hai.streamer", daysAgo: 2 },
  { id: "l5", kind: "gpu", part: "RX 6700 XT", priceVnd: 4_800_000, condition: "used", warrantyMonths: 0, province: "Cần Thơ", seller: "phuc.lab", daysAgo: 3 },
  { id: "l6", kind: "gpu", part: "RTX 3080 10GB", priceVnd: 8_200_000, condition: "used", warrantyMonths: 0, province: "Hà Nội", seller: "tuan_4k", daysAgo: 4 },
  { id: "l7", kind: "gpu", part: "GTX 1660 Super", priceVnd: 1_900_000, condition: "used", warrantyMonths: 0, province: "Đồng Nai", seller: "trung.lienminh", daysAgo: 5 },
  { id: "l8", kind: "gpu", part: "RTX 4070", priceVnd: 10_500_000, condition: "like_new", warrantyMonths: 20, province: "TP.HCM", seller: "khoa.render", daysAgo: 6 },
  { id: "l9", kind: "cpu", part: "Core i5-12400F", priceVnd: 1_900_000, condition: "used", warrantyMonths: 0, province: "Nghệ An", seller: "thanh.bao", daysAgo: 0 },
  { id: "l10", kind: "cpu", part: "Ryzen 5 5600", priceVnd: 1_700_000, condition: "used", warrantyMonths: 0, province: "Quảng Ninh", seller: "hoang.cs2", daysAgo: 2 },
  { id: "l11", kind: "cpu", part: "Ryzen 7 5800X3D", priceVnd: 5_200_000, condition: "like_new", warrantyMonths: 6, province: "Hà Nội", seller: "longdz99", daysAgo: 3 },
  { id: "l12", kind: "cpu", part: "Ryzen 5 7500F", priceVnd: 2_900_000, condition: "used", warrantyMonths: 12, province: "Bắc Ninh", seller: "datvaco", daysAgo: 4 },
  { id: "l13", kind: "cpu", part: "Core i3-12100F", priceVnd: 1_200_000, condition: "used", warrantyMonths: 0, province: "Thái Nguyên", seller: "linh.sv", daysAgo: 7 },
  { id: "l14", kind: "ram", part: "DDR4 16 GB (2×8 GB) 3200 MHz", priceVnd: 650_000, condition: "used", warrantyMonths: 0, province: "Ninh Bình", seller: "bac.van", daysAgo: 1 },
  { id: "l15", kind: "ram", part: "DDR5 32 GB (2×16 GB) 6000 MHz", priceVnd: 2_300_000, condition: "like_new", warrantyMonths: 24, province: "Huế", seller: "quang.edit", daysAgo: 5 },
  { id: "l16", kind: "storage", part: "SSD NVMe Gen3 512 GB", priceVnd: 550_000, condition: "used", warrantyMonths: 0, province: "TP.HCM", seller: "chu.tieu", daysAgo: 2 },
];

/** Màu nhận diện nhạt cho mỗi người (không phải màu dữ liệu) */
export function personTint(handle: string) {
  let h = 0;
  for (const ch of handle) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 45% 78%)`;
}
