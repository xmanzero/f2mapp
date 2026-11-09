/**
 * Thang điểm sức mạnh PC — xem docs/scoring-spec.md.
 * Mốc: i5-12400F = 10.000 (CPU), RTX 3060 12GB = 10.000 (GPU); máy mốc = 10.000 điểm sức mạnh.
 */
import { tr, type Lang } from "./lang";
import type {
  Badge, Bottleneck, Finding, MachineConfig, NeedLevel, RamGb, Resolution, Scores, Socket, StorageKind,
} from "./types";

export const RESOLUTIONS: Resolution[] = [1080, 1440, 2160];
export const RESOLUTION_LABEL: Record<Resolution, string> = { 1080: "1080p", 1440: "1440p", 2160: "4K" };

/** Điểm RAM theo dung lượng: nội suy tuyến tính giữa các mốc (8 GB 5.000 · 16 GB 10.000 · 32 GB 14.000 · 64 GB 17.000 · 128 GB 19.000) */
const RAM_POINTS: [number, number][] = [[2, 1000], [4, 2500], [8, 5000], [16, 10000], [32, 14000], [64, 17000], [128, 19000]];
export function ramScore(gb: RamGb): number {
  if (gb <= RAM_POINTS[0]![0]) return RAM_POINTS[0]![1];
  for (let i = 1; i < RAM_POINTS.length; i++) {
    const [x1, y1] = RAM_POINTS[i]!, [x0, y0] = RAM_POINTS[i - 1]!;
    if (gb <= x1) return y0 + ((gb - x0) / (x1 - x0)) * (y1 - y0);
  }
  return RAM_POINTS.at(-1)![1];
}
/** RAM từ 8 GB trở xuống bị coi là thiếu */
const lowRam = (gb: RamGb) => gb <= 8;
export const STORAGE_SCORE: Record<StorageKind, number> = { hdd: 2000, sata: 7000, nvme3: 10000, nvme4: 12000, nvme5: 13000 };
export const SOCKET_MEMORY: Record<Socket, "DDR4" | "DDR5" | "DDR4/DDR5"> = {
  LGA1151: "DDR4", LGA1200: "DDR4", LGA1700: "DDR4/DDR5", LGA1851: "DDR5", AM4: "DDR4", AM5: "DDR5",
};

/** i5-12400F nuôi ~120 FPS ở 1080p Ultra (bộ game Tom's Hardware 2026) */
export const CPU_FPS_ANCHOR = 120;
/** RTX 3060 12GB ở 1080p Ultra */
const GPU_FPS_ANCHOR = 61.5;
export const WEIGHTS = { gaming: 0.5, render: 0.3, ai: 0.2 } as const;

/** Trung bình điều hòa có trọng số */
const harmonic = (pairs: [number, number][]) => 1 / pairs.reduce((s, [v, w]) => s + w / Math.max(v, 1), 0);
/** Min mềm, số mũ 6 khớp số đo (4090 + 9800X3D: 187 so với đo 183,6) */
const softMin = (a: number, b: number) => (Math.max(a, 1) ** -6 + Math.max(b, 1) ** -6) ** (-1 / 6);
const ANCHOR_FPS = softMin(GPU_FPS_ANCHOR, CPU_FPS_ANCHOR);

export function pcieFactor(cfg: Pick<MachineConfig, "gpu" | "pcieGen">): number {
  const { gpu, pcieGen } = cfg;
  if (pcieGen >= 4) return 1;
  if (gpu.pcieLanes === 4) return 0.8;
  if (gpu.pcieLanes === 8) return gpu.vramGb <= 8 ? 0.94 : 0.97;
  return 1;
}

const ramGamingFactor = (cfg: MachineConfig) => (cfg.ramChannels === 1 ? 0.9 : 1) * (lowRam(cfg.ramGb) ? 0.9 : 1);

export function bottleneck(cfg: MachineConfig, res: Resolution = cfg.resolution): Bottleneck {
  const gpuFps = cfg.gpu.fps[String(res) as "1080"] * pcieFactor(cfg);
  const cpuFps = (cfg.cpu.gaming / 10000) * CPU_FPS_ANCHOR * ramGamingFactor(cfg);
  const lo = Math.min(gpuFps, cpuFps);
  const hi = Math.max(gpuFps, cpuFps);
  return { gpuFps, cpuFps, fps: softMin(gpuFps, cpuFps), loss: 1 - lo / hi, side: gpuFps <= cpuFps ? "gpu" : "cpu" };
}

/** FPS ước tính game AAA mới, thiết lập Ultra */
export const estimateFps = (cfg: MachineConfig, res: Resolution = cfg.resolution) =>
  bottleneck(cfg, res).fps * (lowRam(cfg.ramGb) ? 0.9 : 1);

export function computeScores(cfg: MachineConfig): Scores {
  const ram = ramScore(cfg.ramGb) * (cfg.ramChannels === 1 ? 0.85 : 1);
  const pf = pcieFactor(cfg);
  const vram = (Math.max(cfg.gpu.vramGb, 1) / 12) * 10000;
  const gaming = (bottleneck(cfg, 1080).fps / ANCHOR_FPS) * 10000 * (lowRam(cfg.ramGb) ? 0.9 : 1);
  const render = harmonic([[cfg.cpu.render, 0.5], [cfg.gpu.render * pf, 0.3], [ram, 0.2]]);
  const ai = harmonic([[vram, 0.6], [cfg.gpu.raster * pf, 0.3], [ram, 0.1]]);
  const office = harmonic([[cfg.cpu.single, 0.5], [STORAGE_SCORE[cfg.storage], 0.3], [ram, 0.2]]);
  const power = WEIGHTS.gaming * gaming + WEIGHTS.render * render + WEIGHTS.ai * ai;
  return { gaming, render, ai, office, power };
}

export const TIERS = [
  { min: 0, code: "bronze", name: "Đồng", nameEn: "Bronze" },
  { min: 5000, code: "silver", name: "Bạc", nameEn: "Silver" },
  { min: 9000, code: "gold", name: "Vàng", nameEn: "Gold" },
  { min: 14000, code: "platinum", name: "Bạch kim", nameEn: "Platinum" },
  { min: 20000, code: "diamond", name: "Kim cương", nameEn: "Diamond" },
  { min: 26000, code: "legend", name: "Huyền thoại", nameEn: "Legend" },
] as const;
/** Tên hạng theo ngôn ngữ */
export const tierName = (t: { name: string; nameEn: string }, lang: Lang) => (lang === "en" ? t.nameEn : t.name);
export type Tier = (typeof TIERS)[number];
export const tierOf = (power: number): Tier => [...TIERS].reverse().find((t) => power >= t.min) ?? TIERS[0];

export function psuNeeded(cfg: Pick<MachineConfig, "cpu" | "gpu">): number {
  const raw = Math.max(cfg.gpu.psuRecommendedW, cfg.cpu.powerW + cfg.gpu.boardPowerW + 150);
  return Math.ceil(raw / 50) * 50;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Tầng 1: luật phần cứng */
export function hardwareFindings(cfg: MachineConfig, lang: Lang = "vi"): Finding[] {
  const out: Finding[] = [];
  const need = psuNeeded(cfg);
  if (cfg.psuW < need)
    out.push({
      code: "psu_low", severity: cfg.psuW < need - 100 ? "critical" : "warning",
      message: tr(lang, `Nguồn ${cfg.psuW} W thiếu công suất. CPU (${cfg.cpu.powerW} W) + ${cfg.gpu.name} (${cfg.gpu.boardPowerW} W) cần nguồn từ ${need} W. Máy có thể tắt đột ngột khi chơi game nặng.`,
        `A ${cfg.psuW} W PSU is too weak. CPU (${cfg.cpu.powerW} W) + ${cfg.gpu.name} (${cfg.gpu.boardPowerW} W) need at least ${need} W. The PC may shut down under heavy gaming load.`),
    });
  const pf = pcieFactor(cfg);
  if (pf < 1)
    out.push({
      code: "pcie_gen3", severity: cfg.gpu.pcieLanes === 4 ? "critical" : "warning",
      message: tr(lang, `${cfg.gpu.name} chỉ dùng ${cfg.gpu.pcieLanes} làn PCIe, cắm khe PCIe 3.0 sẽ mất khoảng ${pct(1 - pf)} hiệu năng.`,
        `${cfg.gpu.name} uses only ${cfg.gpu.pcieLanes} PCIe lanes; in a PCIe 3.0 slot it loses about ${pct(1 - pf)} performance.`),
    });
  if (cfg.ramChannels === 1)
    out.push({ code: "ram_single_channel", severity: "warning", message: tr(lang, "RAM chạy kênh đơn, băng thông chỉ còn một nửa. Lắp thêm một thanh cùng loại để chạy kênh đôi.", "RAM runs in single channel, so it has only half the bandwidth. Add a matching stick for dual channel.") });
  if (lowRam(cfg.ramGb))
    out.push({ code: "ram_8gb", severity: "warning", message: tr(lang, `${cfg.ramGb} GB RAM đã thiếu cho game và trình duyệt hiện nay. Nâng lên 16 GB kênh đôi.`, `${cfg.ramGb} GB of RAM is not enough for today's games and browsers. Go to 16 GB dual channel.`) });
  if (cfg.storage === "hdd")
    out.push({ code: "os_on_hdd", severity: "warning", message: tr(lang, "Hệ điều hành nằm trên HDD nên máy khởi động và mở ứng dụng chậm. SSD là nâng cấp đáng tiền nhất.", "The OS is on a hard drive, so booting and opening apps is slow. An SSD is the best-value upgrade.") });
  return out;
}

/** Tầng 2: điểm nghẽn ở độ phân giải đang dùng */
export function bottleneckFinding(cfg: MachineConfig, lang: Lang = "vi"): Finding {
  const b = bottleneck(cfg);
  const r = RESOLUTION_LABEL[cfg.resolution];
  if (b.side === "cpu" && b.loss > 0.15)
    return { code: "cpu_bound", severity: "warning", message: tr(lang, `CPU nghẽn ở ${r}: ${cfg.cpu.name} chỉ nuôi được khoảng ${pct(1 - b.loss)} số khung hình mà ${cfg.gpu.name} làm được.`,
      `CPU bottleneck at ${r}: ${cfg.cpu.name} can only feed about ${pct(1 - b.loss)} of the frames ${cfg.gpu.name} could render.`) };
  if (b.loss <= 0.1) return { code: "balanced", severity: "ok", message: tr(lang, `Cân bằng ở ${r}: CPU và card đồ họa tương xứng nhau.`, `Balanced at ${r}: CPU and graphics card are well matched.`) };
  if (b.side === "gpu")
    return { code: "gpu_bound", severity: "info", message: tr(lang, `Card đồ họa chạy hết công suất ở ${r}, đây là trạng thái bình thường khi chơi game. Muốn tăng FPS thì nâng card.`,
      `The graphics card runs at full load at ${r}, which is normal for gaming. For more FPS, upgrade the card.`) };
  return { code: "cpu_slightly_bound", severity: "info", message: tr(lang, `CPU hơi đuối ở ${r} (chênh ${pct(b.loss)}), chưa đáng lo.`, `The CPU is slightly behind at ${r} (${pct(b.loss)} gap), nothing to worry about yet.`) };
}

/** Lớp 2: mức đáp ứng từng nhu cầu */
export function needLevels(cfg: MachineConfig, s: Scores = computeScores(cfg), lang: Lang = "vi"): NeedLevel[] {
  const T = (vi: string, en: string) => tr(lang, vi, en);
  const fps = estimateFps(cfg);
  const b = bottleneck(cfg);
  const r = RESOLUTION_LABEL[cfg.resolution];
  const g = fps < 30 ? [1, T("Yếu", "Weak")] : fps < 60 ? [2, T("Chơi được", "Playable")] : fps < 100 ? [3, T("Tốt", "Good")] : fps < 144 ? [4, T("Rất tốt", "Great")] : [5, T("Cực mượt", "Ultra smooth")];

  const rd = s.render;
  const d = rd < 5000 ? [1, T("Yếu", "Weak")] : rd < 10000 ? [2, T("Khá", "Fair")] : rd < 18000 ? [3, T("Tốt", "Good")] : rd < 30000 ? [4, T("Rất tốt", "Great")] : [5, T("Chuyên nghiệp", "Professional")];
  const dDetail = (lang === "en"
    ? ["Photo editing, light video work", "Photo editing, light video work", "Full HD video editing, basic 3D rendering", "4K video editing, regular 3D rendering", "Heavy rendering, professional work"]
    : ["Chỉnh ảnh, dựng video nhẹ", "Chỉnh ảnh, dựng video nhẹ", "Dựng video Full HD, render 3D cơ bản", "Dựng video 4K, render 3D thường xuyên", "Render nặng, làm nghề chuyên nghiệp"])[(d[0] as number) - 1]!;

  const v = cfg.gpu.integrated ? 0 : cfg.gpu.vramGb;
  const a = v < 6 ? [1, T("Yếu", "Weak")] : v < 10 ? [2, T("Cơ bản", "Basic")] : v < 16 ? [3, T("Tốt", "Good")] : v < 24 ? [4, T("Rất tốt", "Great")] : [5, v >= 32 ? T("Chuyên nghiệp", "Professional") : T("Chuyên sâu", "Advanced")];
  let aDetail =
    v === 0 ? T("Không có VRAM riêng, chạy AI bằng CPU rất chậm", "No dedicated VRAM; running AI on the CPU is very slow")
    : v < 6 ? T(`${v} GB VRAM: chỉ mô hình rất nhỏ (≤ 3B)`, `${v} GB VRAM: only very small models (≤ 3B)`)
    : v < 10 ? T(`${v} GB VRAM: mô hình 7–8B đã lượng tử hóa`, `${v} GB VRAM: quantized 7–8B models`)
    : v < 16 ? T(`${v} GB VRAM: 7–8B mượt, 14B đã lượng tử hóa`, `${v} GB VRAM: 7–8B smooth, quantized 14B`)
    : v < 24 ? T(`${v} GB VRAM: 14B mượt, tạo ảnh tốt`, `${v} GB VRAM: 14B smooth, good image generation`)
    : v < 32 ? T(`${v} GB VRAM: mô hình tới 32B đã lượng tử hóa`, `${v} GB VRAM: quantized models up to 32B`)
    : T(`${v} GB VRAM: 32B mượt`, `${v} GB VRAM: 32B smooth`);
  if (/^(RX|Arc)/.test(cfg.gpu.name)) aDetail += T(" · phần mềm AI hỗ trợ card AMD/Intel kém NVIDIA", " · AI software supports AMD/Intel cards less well than NVIDIA");

  const o = s.office;
  const of = o < 5000 ? [1, T("Yếu", "Weak")] : o < 6500 ? [2, T("Đủ dùng", "Adequate")] : o < 8000 ? [3, T("Tốt", "Good")] : [4, T("Rất tốt", "Great")];
  const oDetail =
    of[0] === 4 ? T("Dư sức cho Word, Excel, trình duyệt, họp trực tuyến", "Plenty for Office, browsing and video calls")
    : cfg.storage === "hdd" ? T("Ổ HDD làm máy khởi động, mở ứng dụng chậm", "The hard drive makes booting and opening apps slow")
    : lowRam(cfg.ramGb) ? T(`Mở nhiều tab trình duyệt sẽ chậm vì ${cfg.ramGb} GB RAM`, `Many browser tabs will be slow with ${cfg.ramGb} GB RAM`)
    : T("Dùng ổn, mở nhiều ứng dụng cùng lúc hơi chậm", "Fine, a bit slow with many apps open at once");

  const lv = (x: (string | number)[]) => ({ level: x[0] as NeedLevel["level"], levelLabel: x[1] as string });
  return [
    { need: "gaming", label: "Gaming", ...lv(g), fps: Math.round(fps),
      detail: T(`~${Math.round(fps)} FPS game AAA mới, ${r} thiết lập Ultra`, `~${Math.round(fps)} FPS in new AAA games, ${r} Ultra`)
        + (b.side === "cpu" && b.loss > 0.15 ? T(` · CPU kìm card ${pct(b.loss)}`, ` · CPU holds the card back ${pct(b.loss)}`) : "") },
    { need: "render", label: T("Đồ họa", "Creative"), ...lv(d), detail: dDetail },
    { need: "ai", label: "AI", ...lv(a), detail: aDetail },
    { need: "office", label: T("Văn phòng", "Office"), ...lv(of), detail: oDetail },
  ];
}

/** Huy hiệu — hiện kèm hạng, không thay hạng */
export function badgesFor(cfg: MachineConfig, s: Scores = computeScores(cfg), nowYear = new Date().getFullYear(), lang: Lang = "vi"): Badge[] {
  const T = (vi: string, en: string) => tr(lang, vi, en);
  const out: Badge[] = [];
  if (s.power < 3000) out.push({ code: "poor_but_brave", name: T("Nghèo vượt khó", "Underdog"), description: T("Máy yếu mà vẫn chiến được, đáng nể!", "A modest PC that still gets it done. Respect!") });
  const y1 = cfg.cpu.releaseYear, y2 = cfg.gpu.releaseYear ?? y1;
  if (y1 && y2 && nowYear - Math.max(y1, y2) >= 6)
    out.push({ code: "veteran", name: T("Lão làng", "Veteran"), description: T("CPU và card đồ họa đã hơn 6 năm tuổi mà vẫn chạy tốt", "CPU and graphics card are over 6 years old and still going") });
  const b = bottleneck(cfg);
  if (b.side === "cpu" && b.loss > 0.3)
    out.push({ code: "mismatched", name: T("Lệch pha", "Mismatched"), description: T("CPU đang kìm card đồ họa hơn 30% ở độ phân giải màn hình đang dùng", "The CPU holds the graphics card back by over 30% at your resolution") });
  if (!cfg.gpu.integrated && cfg.gpu.vramGb >= 24)
    out.push({ code: "ai_smith", name: T("Thợ AI", "AI smith"), description: T("Từ 24 GB VRAM, chạy được mô hình AI cỡ lớn", "24 GB+ of VRAM, runs large AI models") });
  return out;
}

/** So sánh trước / sau nâng cấp, kèm cảnh báo tương thích */
export function compareUpgrade(current: MachineConfig, next: MachineConfig, lang: Lang = "vi") {
  const a = computeScores(current), b = computeScores(next);
  const delta = (k: keyof Scores) => b[k] / a[k] - 1;
  const warnings: Finding[] = [];
  if (next.cpu.socket !== current.cpu.socket) {
    const toDdr5 = SOCKET_MEMORY[next.cpu.socket] === "DDR5" && SOCKET_MEMORY[current.cpu.socket] !== "DDR5";
    warnings.push({ code: "socket_change", severity: "warning",
      message: tr(lang, `Khác socket (${current.cpu.socket} → ${next.cpu.socket}): phải thay mainboard${toDdr5 ? " và chuyển sang RAM DDR5" : ""}.`,
        `Different socket (${current.cpu.socket} → ${next.cpu.socket}): needs a new motherboard${toDdr5 ? " and DDR5 RAM" : ""}.`) });
  }
  const need = psuNeeded(next);
  if (next.psuW < need) warnings.push({ code: "psu_low", severity: "warning", message: tr(lang, `Cần nguồn từ ${need} W cho cấu hình mới (đang ${next.psuW} W).`, `The new build needs a ${need} W+ PSU (currently ${next.psuW} W).`) });
  const pf = pcieFactor(next);
  if (pf < 1) warnings.push({ code: "pcie_gen3", severity: "warning", message: tr(lang, `${next.gpu.name} chạy x${next.gpu.pcieLanes}, cắm khe PCIe 3.0 mất khoảng ${pct(1 - pf)}.`, `${next.gpu.name} runs at x${next.gpu.pcieLanes}; in a PCIe 3.0 slot it loses about ${pct(1 - pf)}.`) });
  return {
    before: a, after: b,
    delta: { gaming: delta("gaming"), render: delta("render"), ai: delta("ai"), power: delta("power") },
    fpsBefore: Math.round(estimateFps(current)), fpsAfter: Math.round(estimateFps(next)),
    tierAfter: tierOf(b.power), warnings,
  };
}

/** Kết quả đầy đủ cho một máy */
export function evaluate(cfg: MachineConfig, nowYear?: number, lang: Lang = "vi") {
  const scores = computeScores(cfg);
  return {
    scores,
    tier: tierOf(scores.power),
    needs: needLevels(cfg, scores, lang),
    findings: [...hardwareFindings(cfg, lang), bottleneckFinding(cfg, lang)],
    bottlenecks: RESOLUTIONS.map((r) => ({ resolution: r, ...bottleneck(cfg, r) })),
    badges: badgesFor(cfg, scores, nowYear, lang),
  };
}
