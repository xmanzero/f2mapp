import { describe, expect, it } from "vitest";
import {
  badgesFor, bottleneck, compareUpgrade, computeScores, estimateFps, evaluate, needLevels, resolveMachine, tierOf,
  type MachineInput,
} from "../src";

const machine = (over: Partial<MachineInput>): MachineInput => ({
  cpu: "Core i5-12400F", gpu: "RTX 3060 12GB", ramGb: 16, ramChannels: 2, storage: "nvme3", pcieGen: 4, psuW: 550, resolution: 1080,
  ...over,
});
const cfg = (over: Partial<MachineInput> = {}) => resolveMachine(machine(over));

// Số kỳ vọng lấy từ bản mẫu prototype/tinh-diem-may.html (thang điểm v0.5)
describe("máy mốc", () => {
  it("được đúng 10.000 ở mọi điểm con và điểm sức mạnh", () => {
    const s = computeScores(cfg());
    for (const k of ["gaming", "render", "ai", "office", "power"] as const) expect(Math.round(s[k])).toBe(10000);
    expect(tierOf(s.power).name).toBe("Vàng");
  });
  it("chơi game ~61 FPS ở 1080p, mức Tốt", () => {
    expect(Math.round(estimateFps(cfg()))).toBe(61);
    expect(needLevels(cfg())[0]).toMatchObject({ need: "gaming", levelLabel: "Tốt" });
  });
});

describe("mô hình FPS khớp số đo Tom's Hardware (9800X3D, 1080p Ultra)", () => {
  const fps = (gpu: string) => bottleneck(cfg({ cpu: "Ryzen 7 9800X3D", gpu, pcieGen: 5 }), 1080).fps;
  it.each([["RTX 4090", 183.6], ["RTX 5090", 203.8], ["RTX 4070", 111.5]])("%s ≈ %d FPS (sai lệch < 3%%)", (gpu, measured) => {
    expect(Math.abs(fps(gpu) / measured - 1)).toBeLessThan(0.03);
  });
});

describe("máy mẫu", () => {
  it("i3-10100F + RTX 4070 Super: CPU nghẽn ở 1080p, huy hiệu Lệch pha", () => {
    const c = cfg({ cpu: "Core i3-10100F", gpu: "RTX 4070 Super", pcieGen: 3, psuW: 650 });
    const s = computeScores(c);
    expect(Math.round(s.power)).toBe(11604);
    expect(bottleneck(c).side).toBe("cpu");
    expect(badgesFor(c, s).map((b) => b.name)).toEqual(["Lệch pha"]);
    // ở 4K card mới là bên nghẽn
    expect(bottleneck(c, 2160).side).toBe("gpu");
  });
  it("9800X3D + RTX 5090 ở 4K: Huyền thoại, Thợ AI, không bị Lệch pha", () => {
    const c = cfg({ cpu: "Ryzen 7 9800X3D", gpu: "RTX 5090", ramGb: 64, storage: "nvme5", pcieGen: 5, psuW: 1000, resolution: 2160 });
    const r = evaluate(c, 2026);
    expect(Math.round(r.scores.power)).toBe(29491);
    expect(r.tier.name).toBe("Huyền thoại");
    expect(r.badges.map((b) => b.name)).toEqual(["Thợ AI"]);
  });
  it("máy cỏ dùng đồ họa tích hợp: Nghèo vượt khó + Lão làng", () => {
    const c = cfg({ cpu: "Core i3-10100", gpu: "Đồ họa tích hợp (iGPU)", ramGb: 8, ramChannels: 1, storage: "hdd", pcieGen: 3, psuW: 300 });
    expect(badgesFor(c, computeScores(c), 2026).map((b) => b.name)).toEqual(["Nghèo vượt khó", "Lão làng"]);
  });
  it("văn phòng không bị kéo xuống bởi CPU yếu so với card", () => {
    const c = cfg({ cpu: "Core i3-10100F", gpu: "RTX 4070 Super", pcieGen: 3, psuW: 650 });
    expect(needLevels(c).find((n) => n.need === "office")?.levelLabel).toBe("Rất tốt");
  });
});

describe("luật phần cứng", () => {
  it("card x8 trên khe PCIe 3.0 và nguồn thiếu", () => {
    const r = evaluate(cfg({ cpu: "Ryzen 5 3600", gpu: "RTX 4060", pcieGen: 3, psuW: 500 }));
    const codes = r.findings.map((f) => f.code);
    expect(codes).toContain("pcie_gen3");
    expect(codes).toContain("psu_low");
  });
  it("đổi CPU khác socket cảnh báo thay mainboard và DDR5", () => {
    const up = compareUpgrade(cfg({ cpu: "Ryzen 5 3600" }), cfg({ cpu: "Ryzen 7 9800X3D" }));
    expect(up.warnings[0]?.message).toContain("DDR5");
    expect(up.delta.gaming).toBeGreaterThan(0);
  });
});

it("tên linh kiện lạ báo lỗi rõ ràng", () => {
  expect(() => cfg({ cpu: "Pentium 4" })).toThrow(/Không có CPU/);
});
