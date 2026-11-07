import { describe, expect, it } from "vitest";
import { bottleneck, CPUS, resolveMachine, suggestUpgrades, type MachineInput } from "../src";

const cfg = (over: Partial<MachineInput> = {}) =>
  resolveMachine({ cpu: "Core i5-12400F", gpu: "RTX 3060 12GB", ramGb: 16, ramChannels: 2, storage: "nvme3", pcieGen: 4, psuW: 550, resolution: 1080, ...over });

describe("gợi ý nâng cấp", () => {
  it("máy lệch (i3-10100F + 4070 Super): gợi ý CPU trước, CPU vừa đủ, báo đổi socket", () => {
    const s = suggestUpgrades(cfg({ cpu: "Core i3-10100F", gpu: "RTX 4070 Super", pcieGen: 3, psuW: 650 }));
    const c = cfg({ cpu: "Core i3-10100F", gpu: "RTX 4070 Super", pcieGen: 3, psuW: 650 });
    expect(s[0]?.kind).toBe("cpu");
    const pick = s[0]!.next.cpu;
    // hết nghẽn, và không CPU nào yếu hơn mà cũng hết nghẽn ("vừa đủ")
    expect(bottleneck(s[0]!.next).loss <= 0.1 || bottleneck(s[0]!.next).side === "gpu").toBe(true);
    const weakerEnough = CPUS.filter((x) => x.gaming > c.cpu.gaming && x.gaming < pick.gaming)
      .some((cpu) => bottleneck({ ...c, cpu }).loss <= 0.1);
    expect(weakerEnough).toBe(false);
    // LGA1200 không có CPU nào đủ → phải đổi socket
    expect(s[0]?.warnings.map((w) => w.code)).toContain("socket_change");
    expect(s[0]!.fpsAfter).toBeGreaterThan(s[0]!.fpsBefore);
  });
  it("máy cỏ: sửa nguồn/RAM/ổ trước, rồi mới tới card", () => {
    const s = suggestUpgrades(cfg({ cpu: "Core i3-10100", gpu: "GTX 1650", ramGb: 8, ramChannels: 1, storage: "hdd", pcieGen: 3, psuW: 300 }));
    expect(s.map((x) => x.kind)).toEqual(["psu", "ram", "storage", "gpu"]);
  });
  it("máy mốc: chỉ gợi ý card, FPS tăng ≥ 40%", () => {
    const s = suggestUpgrades(cfg());
    expect(s.map((x) => x.kind)).toEqual(["gpu"]);
    expect(s[0]!.fpsAfter / s[0]!.fpsBefore).toBeGreaterThanOrEqual(1.39);
    expect(s[0]!.powerGain).toBeGreaterThan(0);
  });
  it("máy đầu bảng ở 4K: không còn card nào đủ tăng 40% thì không gợi ý", () => {
    const s = suggestUpgrades(cfg({ cpu: "Ryzen 7 9800X3D", gpu: "RTX 5090", ramGb: 64, storage: "nvme5", pcieGen: 5, psuW: 1000, resolution: 2160 }));
    expect(s).toEqual([]);
  });
});
