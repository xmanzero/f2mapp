import { describe, expect, it } from "vitest";
import { bottleneck, CPUS, resolveMachine, suggestUpgrades, type MachineInput } from "../src";

const cfg = (over: Partial<MachineInput> = {}) =>
  resolveMachine({ cpu: "Core i5-12400F", gpu: "RTX 3060 12GB", ramGb: 16, ramChannels: 2, storage: "nvme3", pcieGen: 4, psuW: 550, resolution: 1080, ...over });

describe("gợi ý nâng cấp", () => {
  it("máy lệch (i5-8400 + 4070 Super): gợi ý CPU trước, CPU vừa đủ, báo đổi socket", () => {
    const s = suggestUpgrades(cfg({ cpu: "Core i5-8400", gpu: "RTX 4070 Super", pcieGen: 3, psuW: 650 }));
    const c = cfg({ cpu: "Core i5-8400", gpu: "RTX 4070 Super", pcieGen: 3, psuW: 650 });
    expect(s[0]?.kind).toBe("cpu");
    const pick = s[0]!.next.cpu;
    // hết nghẽn, và không CPU nào yếu hơn mà cũng hết nghẽn ("vừa đủ")
    expect(bottleneck(s[0]!.next).loss <= 0.1 || bottleneck(s[0]!.next).side === "gpu").toBe(true);
    const weakerEnough = CPUS.filter((x) => x.gaming > c.cpu.gaming && x.gaming < pick.gaming)
      .some((cpu) => bottleneck({ ...c, cpu }).loss <= 0.1);
    expect(weakerEnough).toBe(false);
    // LGA1151 không có CPU nào đủ → phải đổi socket
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

describe("cấu hình chi tiết", () => {
  it("quy đổi về dạng tóm tắt: cộng dung lượng RAM, kênh theo số thanh, ổ hệ điều hành", async () => {
    const { specToInput, machineSpecSchema, partLabel, computeScores, resolveMachine, ramScore } = await import("../src");
    const spec = machineSpecSchema.parse({
      cpu: "Ryzen 5 7500F", gpu: "RTX 4060", mainboard: { model: "MSI B650M", chipset: "B650", pcieGen: 4 },
      ram: [{ sticks: 2, perStickGb: 16, type: "DDR5", speedMhz: 6000, model: "Kingston Fury" }],
      drives: [{ interface: "hdd", capacityGb: 2000, model: null, isBoot: false }, { interface: "nvme4", capacityGb: 1000, model: "Samsung 990 Pro", healthPct: 98, isBoot: true }],
      psu: { wattage: 650, model: null, rating: "80 Plus Gold" }, resolution: 1440,
    });
    expect(specToInput(spec)).toMatchObject({ ramGb: 32, ramChannels: 2, storage: "nvme4", pcieGen: 4, psuW: 650 });
    expect(partLabel.ram(spec.ram[0]!)).toBe("Kingston Fury · 2×16 GB DDR5 6000 MHz");
    expect(partLabel.drive(spec.drives[1]!)).toBe("Samsung 990 Pro · NVMe Gen4 1 TB");
    // 24 GB nằm giữa 16 và 32: điểm RAM nội suy
    expect(ramScore(24)).toBe(12000);
    expect(Math.round(computeScores(resolveMachine(specToInput(spec))).power)).toBeGreaterThan(0);
  });
  it("tối đa 8 thanh RAM, phải có ít nhất 1 ổ", async () => {
    const { machineSpecSchema } = await import("../src");
    const base = { cpu: "Core i5-12400F", gpu: "RTX 3060 12GB", mainboard: { pcieGen: 4 }, psu: { wattage: 550 }, resolution: 1080 };
    expect(machineSpecSchema.safeParse({ ...base, ram: [{ sticks: 8, perStickGb: 8, type: "DDR4" }, { sticks: 1, perStickGb: 8, type: "DDR4" }], drives: [{ interface: "sata", capacityGb: 512 }] }).success).toBe(false);
    expect(machineSpecSchema.safeParse({ ...base, ram: [{ sticks: 2, perStickGb: 8, type: "DDR4" }], drives: [] }).success).toBe(false);
  });
});

describe("RAM: DDR4/DDR5, ECC, RDIMM, SO-DIMM", () => {
  it("cảnh báo RAM không hợp với máy", async () => {
    const { ramFindings, partLabel } = await import("../src");
    const codes = (cpu: string, ram: object[]) => ramFindings({ cpu, ram: ram as never }).map((f) => f.code);
    const k = (o: object) => ({ sticks: 2, perStickGb: 16, type: "DDR5", speedMhz: 6000, model: null, formFactor: "dimm", ecc: false, registered: false, ...o });
    expect(codes("Ryzen 5 7500F", [k({})])).toEqual([]);
    expect(codes("Ryzen 5 5600", [k({})])).toContain("ram_type_platform");          // AM4 chỉ DDR4
    expect(codes("Core i5-12400F", [k({ type: "DDR4" })])).toEqual([]);               // LGA1700 nhận cả hai
    expect(codes("Core i5-12400F", [k({ type: "DDR4" }), k({})])).toContain("ram_mixed_type");
    expect(codes("Ryzen 5 7500F", [k({ formFactor: "sodimm" })])).toContain("ram_sodimm");
    expect(codes("Ryzen 5 7500F", [k({ ecc: true, registered: true })])).toContain("ram_registered");
    expect(codes("Ryzen 5 7500F", [k({ ecc: true })])).toContain("ram_ecc");
    expect(partLabel.ram(k({ ecc: true, registered: true }) as never)).toBe("2×16 GB DDR5 6000 MHz ECC RDIMM");
  });
  it("RDIMM bắt buộc có ECC; mặc định là DIMM thường", async () => {
    const { ramKitSchema } = await import("../src");
    expect(ramKitSchema.safeParse({ sticks: 1, perStickGb: 32, type: "DDR4", registered: true, ecc: false }).success).toBe(false);
    expect(ramKitSchema.parse({ sticks: 1, perStickGb: 8, type: "DDR4" })).toMatchObject({ formFactor: "dimm", ecc: false, registered: false });
  });
});
