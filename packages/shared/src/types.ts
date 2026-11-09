/** BGA = CPU laptop hàn trên bo (không thay được) */
export type Socket = "BGA" | "LGA1151" | "LGA1200" | "LGA1700" | "LGA1851" | "AM4" | "AM5";
export type Resolution = 1080 | 1440 | 2160;
/** Tổng dung lượng RAM (GB) */
export type RamGb = number;
export type StorageKind = "hdd" | "sata" | "nvme3" | "nvme4" | "nvme5";
export type PcieGen = 3 | 4 | 5;
export type DataSource = "toms" | "blender" | "est" | "measured";

export interface Cpu {
  name: string;
  socket: Socket;
  powerW: number;
  releaseYear: number | null;
  /** Khả năng nuôi khung hình trong game. i5-12400F = 10.000 */
  gaming: number;
  /** Đơn nhân. i5-12400F = 10.000 */
  single: number;
  /** Đa nhân / render (Blender). i5-12400F = 10.000 */
  render: number;
  source: { gm: DataSource; st: DataSource; mt: DataSource };
  /** CPU laptop */
  mobile?: boolean;
}

export interface Gpu {
  name: string;
  /** FPS game AAA thiết lập Ultra, theo độ phân giải */
  fps: Record<"1080" | "1440" | "2160", number>;
  /** Điểm sức mạnh hiển thị. RTX 3060 12GB = 10.000 */
  raster: number;
  rayTracing: number | null;
  /** Render 3D (Blender). RTX 3060 12GB = 10.000 */
  render: number;
  /** Nguồn điểm render: Blender Open Data, ước tính, hay số đo người dùng đã xác minh */
  renderSource: DataSource;
  vramGb: number;
  pcieLanes: 4 | 8 | 16;
  boardPowerW: number;
  psuRecommendedW: number;
  releaseYear: number | null;
  integrated: boolean;
  source: DataSource;
  /** Card laptop */
  mobile?: boolean;
  /**
   * Dải công suất (TGP, W — gồm Dynamic Boost) của card laptop NVIDIA. Số FPS / điểm của mẫu tính ở TGP tối đa,
   * máy có TGP thấp hơn thì hiệu năng giảm theo (TGP / tối đa)^0,4. null = không chỉnh theo công suất.
   */
  tgp?: { min: number; max: number; default: number } | null;
}

export interface MachineConfig {
  cpu: Cpu;
  gpu: Gpu;
  ramGb: RamGb;
  ramChannels: 1 | 2;
  storage: StorageKind;
  pcieGen: PcieGen;
  psuW: number;
  /** Độ phân giải màn hình người dùng đang dùng */
  resolution: Resolution;
  /** Laptop: chấm nguyên chiếc — không có luật nguồn / PCIe, chỉ gợi ý nâng RAM / ổ cứng */
  laptop?: boolean;
  /** TGP thực tế của card laptop (W) */
  gpuTgpW?: number;
}

export interface Scores {
  gaming: number;
  render: number;
  ai: number;
  /** Chỉ dùng cho mức đáp ứng Văn phòng, không tính vào điểm sức mạnh */
  office: number;
  /** Điểm sức mạnh = 0,5 Gaming + 0,3 Đồ họa + 0,2 AI */
  power: number;
}

export type Severity = "critical" | "warning" | "info" | "ok";

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
}

export type NeedKey = "gaming" | "render" | "ai" | "office";
export interface NeedLevel {
  need: NeedKey;
  label: string;
  /** 1 (yếu) … 5 (cao nhất) */
  level: 1 | 2 | 3 | 4 | 5;
  levelLabel: string;
  detail: string;
  /** Chỉ có ở Gaming */
  fps?: number;
}

export interface Bottleneck {
  gpuFps: number;
  cpuFps: number;
  fps: number;
  /** 0..1 */
  loss: number;
  side: "gpu" | "cpu";
}

export interface Badge {
  code: string;
  name: string;
  description: string;
}
