import { listingPath } from "./listing-url";
import { computeScores, estimateFps, findCpu, findGpu, type MachineConfig } from "@f2m/shared";
import { SAMPLE_LISTINGS } from "@/data/sample";

export type ListingKind = "gpu" | "cpu" | "mainboard" | "ram" | "storage" | "psu";
export type Condition = "new" | "like_new" | "used" | "for_parts";
export type ListingStatus = "active" | "reserved" | "sold" | "hidden" | "expired";

export interface Listing {
  id: string; kind: ListingKind; name: string; partName: string | null; inCatalog: boolean;
  priceVnd: number; condition: Condition; warrantyMonths: number | null; province: string | null;
  description: string | null; status: ListingStatus; createdAt: string; updatedAt: string; soldAt: string | null; expiresAt: string;
  /** quản trị viên đã gỡ tin (kèm lý do); người bán không tự mở lại được */
  removedReason?: string | null;
  seller: { id: string; handle: string; displayName: string };
  /** Linh kiện này trong máy người bán */
  source: { machineName: string; machine: string; tier: string | null; power: number | null; inUse: boolean; installedAt: string; verified: boolean; verifiedAt: string | null } | null;
  /** id ảnh theo thứ tự, ảnh đầu là ảnh bìa */
  photos: string[];
  mine: boolean; contact: string | null; contactHidden: boolean;
  /** tin mẫu (dữ liệu giả lập để chợ không trống) */
  sample?: boolean;
}
/** Linh kiện bán được (đang lắp / đã thay ra) trong các máy của người dùng */
export interface SellablePart {
  id: string; kind: ListingKind; label: string; inUse: boolean; verified: boolean; addedAt: string; replacedAt: string | null;
  machineId: string; machineName: string; isPrimary: boolean; listingId: string | null;
}

export const KIND_LABEL: Record<ListingKind, string> = { gpu: "Card đồ họa", cpu: "CPU", mainboard: "Mainboard", ram: "RAM", storage: "Ổ cứng", psu: "Nguồn" };
export const CONDITION_LABEL: Record<Condition, string> = { new: "Mới", like_new: "Như mới", used: "Đã dùng", for_parts: "Hỏng, bán xác" };
export const STATUS_LABEL: Record<ListingStatus, string> = { active: "Đang bán", reserved: "Đã có người hẹn", sold: "Đã bán", hidden: "Đã ẩn", expired: "Hết hạn" };

/** Một dòng trong chợ: tin thật hoặc tin mẫu (chưa đủ tin thật) */
export interface MarketRow {
  id: string; kind: ListingKind; name: string; partName: string | null; priceVnd: number; condition: Condition;
  warrantyMonths: number | null; province: string | null; seller: string; daysAgo: number; sample: boolean; href: string | null;
  /** null = tin mẫu */
  verified: boolean | null; inUse: boolean;
  /** Tin thật: thời điểm đăng / hết hạn (ISO). Tin mẫu: tính từ daysAgo + sampleDays khi biết giờ hiện tại */
  createdAt: string | null; expiresAt: string | null; sampleDays: number;
  /** id ảnh bìa và số ảnh */
  photo: string | null; photoCount: number;
}

export const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
export const daysLabel = (d: number) => (d === 0 ? "hôm nay" : d === 1 ? "hôm qua" : `${d} ngày trước`);

export function toRow(l: Listing): MarketRow {
  return {
    id: l.id, kind: l.kind, name: l.name, partName: l.partName, priceVnd: l.priceVnd, condition: l.condition,
    warrantyMonths: l.warrantyMonths, province: l.province, seller: l.seller.handle, daysAgo: daysSince(l.createdAt),
    sample: false, href: listingPath(l), verified: l.source?.verified ?? false, inUse: l.source?.inUse ?? false,
    createdAt: l.createdAt, expiresAt: l.expiresAt, sampleDays: 0, photo: l.photos[0] ?? null, photoCount: l.photos.length,
  };
}
export const SAMPLE_ROWS: MarketRow[] = SAMPLE_LISTINGS.map((s) => ({
  id: s.id, kind: s.kind, name: s.part, partName: s.kind === "gpu" || s.kind === "cpu" ? s.part : null,
  priceVnd: s.priceVnd, condition: s.condition, warrantyMonths: s.warrantyMonths, province: s.province,
  seller: s.seller, daysAgo: s.daysAgo, sample: true, href: `/cho/tin?id=${s.id}`, verified: null, inUse: false,
  createdAt: null, expiresAt: null, sampleDays: s.durationDays, photo: null, photoCount: 0,
}));

/** Tin mẫu dạng tin đầy đủ để mở trang chi tiết; thời điểm tính từ `now` (chỉ gọi ở trình duyệt) */
export function sampleListing(id: string, now: number): Listing | null {
  const s = SAMPLE_LISTINGS.find((x) => x.id === id);
  if (!s) return null;
  const created = now - s.daysAgo * 86_400_000 - 3 * 3_600_000;
  const iso = (t: number) => new Date(t).toISOString();
  return {
    id: s.id, kind: s.kind, name: s.part, partName: s.kind === "gpu" || s.kind === "cpu" ? s.part : null, inCatalog: s.kind === "gpu" || s.kind === "cpu",
    priceVnd: s.priceVnd, condition: s.condition, warrantyMonths: s.warrantyMonths, province: s.province,
    description: null, status: "active", createdAt: iso(created), updatedAt: iso(created), soldAt: null, expiresAt: iso(created + s.durationDays * 86_400_000),
    seller: { id: "", handle: s.seller, displayName: s.seller }, source: null, photos: [],
    mine: false, contact: null, contactHidden: false, sample: true,
  };
}
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

// ---------- thời hạn bán ----------
export const DURATIONS = [1, 2, 3, 5, 7, 14, 30] as const;
const HOUR = 3_600_000, DAY = 86_400_000;

export type LifeState = "new" | "normal" | "ending" | "expired";
export interface Life { state: LifeState; created: number; expires: number; remaining: number; fraction: number }

/** Thời điểm đăng / hết hạn của một dòng (tin mẫu tính từ giờ hiện tại) */
export function rowTimes(r: MarketRow, now: number) {
  if (r.createdAt && r.expiresAt) return { created: new Date(r.createdAt).getTime(), expires: new Date(r.expiresAt).getTime() };
  const created = now - r.daysAgo * DAY - 3 * HOUR;
  return { created, expires: created + r.sampleDays * DAY };
}

/**
 * Vòng đời tin: "mới đăng" trong 24 giờ đầu, "sắp hết hạn" khi còn dưới 24 giờ;
 * tin ngắn ngày (1–2 ngày) dùng 1/4 thời gian thay cho 24 giờ.
 */
export function lifeOf(created: number, expires: number, now: number): Life {
  const total = Math.max(expires - created, 1);
  const window = Math.min(DAY, total / 4);
  const remaining = expires - now;
  const state: LifeState = remaining <= 0 ? "expired" : remaining <= window ? "ending" : now - created <= window ? "new" : "normal";
  return { state, created, expires, remaining, fraction: Math.max(0, Math.min(1, remaining / total)) };
}

export const LIFE_LABEL: Record<LifeState, string> = { new: "Mới đăng", normal: "Đang bán", ending: "Sắp hết hạn", expired: "Hết hạn" };

export function remainingLabel(ms: number) {
  if (ms <= 0) return "đã hết hạn";
  if (ms < HOUR) return `còn ${Math.max(1, Math.round(ms / 60_000))} phút`;
  // làm tròn theo giờ trước rồi mới tách ngày / giờ (tránh "2 ngày 24 giờ")
  const hours = Math.round(ms / HOUR);
  if (hours < 24) return `còn ${hours} giờ`;
  const d = Math.floor(hours / 24), h = hours % 24;
  return h && d < 3 ? `còn ${d} ngày ${h} giờ` : `còn ${Math.round(ms / DAY)} ngày`;
}
/** "15/11 lúc 07:06" */
export const endLabel = (t: number) => {
  const d = new Date(t), p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} lúc ${p(d.getHours())}:${p(d.getMinutes())}`;
};
