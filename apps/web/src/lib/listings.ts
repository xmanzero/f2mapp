import { computeScores, estimateFps, findCpu, findGpu, type MachineConfig } from "@f2m/shared";
import { SAMPLE_LISTINGS } from "@/data/sample";

export type ListingKind = "gpu" | "cpu" | "ram" | "storage" | "other";
export type Condition = "new" | "like_new" | "used" | "for_parts";
export type ListingStatus = "active" | "reserved" | "sold" | "hidden";

export interface Listing {
  id: string; kind: ListingKind; name: string; partName: string | null; inCatalog: boolean;
  priceVnd: number; condition: Condition; warrantyMonths: number | null; province: string | null;
  description: string | null; status: ListingStatus; createdAt: string; updatedAt: string; soldAt: string | null;
  seller: { id: string; handle: string; displayName: string };
  mine: boolean; contact: string | null; contactHidden: boolean;
}
export interface ReplacedPart { id: string; kind: "cpu" | "gpu"; name: string; added_at: string }

export const KIND_LABEL: Record<ListingKind, string> = { gpu: "Card đồ họa", cpu: "CPU", ram: "RAM", storage: "Ổ SSD / HDD", other: "Khác" };
export const CONDITION_LABEL: Record<Condition, string> = { new: "Mới", like_new: "Như mới", used: "Đã dùng", for_parts: "Hỏng, bán xác" };
export const STATUS_LABEL: Record<ListingStatus, string> = { active: "Đang bán", reserved: "Đã có người hẹn", sold: "Đã bán", hidden: "Đã ẩn" };

/** Một dòng trong chợ: tin thật hoặc tin mẫu (chưa đủ tin thật) */
export interface MarketRow {
  id: string; kind: ListingKind; name: string; partName: string | null; priceVnd: number; condition: Condition;
  warrantyMonths: number | null; province: string | null; seller: string; daysAgo: number; sample: boolean; href: string | null;
}

export const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
export const daysLabel = (d: number) => (d === 0 ? "hôm nay" : d === 1 ? "hôm qua" : `${d} ngày trước`);

export function toRow(l: Listing): MarketRow {
  return {
    id: l.id, kind: l.kind, name: l.name, partName: l.partName, priceVnd: l.priceVnd, condition: l.condition,
    warrantyMonths: l.warrantyMonths, province: l.province, seller: l.seller.handle, daysAgo: daysSince(l.createdAt),
    sample: false, href: `/cho/tin?id=${l.id}`,
  };
}
export const SAMPLE_ROWS: MarketRow[] = SAMPLE_LISTINGS.map((s) => ({
  id: s.id, kind: s.kind, name: s.part, partName: s.kind === "gpu" || s.kind === "cpu" ? s.part : null,
  priceVnd: s.priceVnd, condition: s.condition, warrantyMonths: s.warrantyMonths, province: s.province,
  seller: s.seller, daysAgo: s.daysAgo, sample: true, href: null,
}));
/** Dưới số tin thật này thì ghép thêm tin mẫu (có nhãn) để chợ không trống */
export const MIN_REAL_LISTINGS = 10;

export interface Fit { gain: number | null; note: string; fpsBefore?: number; fpsAfter?: number }
/** Lắp linh kiện này vào máy của người dùng thì điểm sức mạnh đổi bao nhiêu */
export function fitFor(kind: ListingKind, partName: string | null, mine: MachineConfig | null): Fit {
  if (!mine || !partName) return { gain: null, note: "—" };
  const before = computeScores(mine).power;
  if (kind === "gpu") {
    const gpu = findGpu(partName);
    if (!gpu) return { gain: null, note: "—" };
    const next = { ...mine, gpu };
    return { gain: computeScores(next).power / before - 1, note: "", fpsBefore: Math.round(estimateFps(mine)), fpsAfter: Math.round(estimateFps(next)) };
  }
  if (kind === "cpu") {
    const cpu = findCpu(partName);
    if (!cpu) return { gain: null, note: "—" };
    if (cpu.socket !== mine.cpu.socket) return { gain: null, note: `Khác socket (${cpu.socket})` };
    const next = { ...mine, cpu };
    return { gain: computeScores(next).power / before - 1, note: "", fpsBefore: Math.round(estimateFps(mine)), fpsAfter: Math.round(estimateFps(next)) };
  }
  return { gain: null, note: "—" };
}

/** Điểm linh kiện trên mỗi triệu đồng (card: sức mạnh game, CPU: gaming) */
export function valueOf(kind: ListingKind, partName: string | null, priceVnd: number): number | null {
  if (!partName) return null;
  const pts = kind === "gpu" ? findGpu(partName)?.raster : kind === "cpu" ? findCpu(partName)?.gaming : undefined;
  return pts ? pts / (priceVnd / 1_000_000) : null;
}

/** Trung vị giá các tin cùng linh kiện (tin thật + mẫu), để so giá */
export function medianPrice(rows: MarketRow[], partName: string, exceptId?: string) {
  const prices = rows.filter((r) => r.partName === partName && r.id !== exceptId).map((r) => r.priceVnd).sort((a, b) => a - b);
  if (prices.length === 0) return null;
  const mid = Math.floor(prices.length / 2);
  return { median: prices.length % 2 ? prices[mid]! : Math.round((prices[mid - 1]! + prices[mid]!) / 2), count: prices.length };
}
