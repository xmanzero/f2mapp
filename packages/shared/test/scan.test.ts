import { describe, expect, it } from "vitest";
import {
  chipsetOf, drivesFrom, interpretScan, mainboardFrom, matchCpu, matchGpu, pcieGenOfChipset, primaryGpu, ramKitsFrom, resolutionOf,
  sameScannedPart, scanReportSchema, specFromScan,
} from "../src";

const GB = 2 ** 30;

describe("nhận diện CPU", () => {
  it("tên WMI của Intel / AMD", () => {
    expect(matchCpu("Intel(R) Core(TM) i5-14600K").name).toBe("Core i5-14600K");
    expect(matchCpu("13th Gen Intel(R) Core(TM) i5-13400F").name).toBe("Core i5-13400F");
    expect(matchCpu("Intel(R) Core(TM) Ultra 7 265K").name).toBe("Core Ultra 7 265K");
    expect(matchCpu("AMD Ryzen 7 7800X3D 8-Core Processor").name).toBe("Ryzen 7 7800X3D");
    expect(matchCpu("AMD Ryzen 5 5600 6-Core Processor             ").name).toBe("Ryzen 5 5600");
  });
  it("KF tương đương K", () => {
    const m = matchCpu("Intel(R) Core(TM) i5-14600KF");
    expect(m).toMatchObject({ name: "Core i5-14600K", equivalent: true });
  });
  it("chưa có trong danh mục → gợi ý mẫu gần nhất", () => {
    expect(matchCpu("Intel(R) Core(TM) i7-13700")).toMatchObject({ name: null, suggestion: "Core i7-13700K" });
    expect(matchCpu("Intel(R) Core(TM) i7-14700").name).toBe("Core i7-14700");
  });
});

describe("nhận diện card", () => {
  it("phân biệt bản VRAM theo dung lượng đọc được", () => {
    expect(matchGpu("NVIDIA GeForce RTX 3060", 12).name).toBe("RTX 3060 12GB");
    expect(matchGpu("NVIDIA GeForce RTX 4060 Ti", 16).name).toBe("RTX 4060 Ti 16GB");
    expect(matchGpu("NVIDIA GeForce RTX 4060 Ti", 8).name).toBe("RTX 4060 Ti 8GB");
    expect(matchGpu("AMD Radeon RX 9060 XT", 16).name).toBe("RX 9060 XT 16GB");
    expect(matchGpu("Intel(R) Arc(TM) B580 Graphics", 12).name).toBe("Arc B580");
  });
  it("đồ họa tích hợp", () => {
    expect(matchGpu("Intel(R) UHD Graphics 770", null).name).toBe("Đồ họa tích hợp (iGPU)");
    expect(matchGpu("AMD Radeon(TM) Graphics", null).name).toBe("Đồ họa tích hợp (iGPU)");
  });
  it("chưa có trong danh mục → gợi ý", () => {
    expect(matchGpu("NVIDIA GeForce GTX 1650 SUPER", 4)).toMatchObject({ name: null, suggestion: "GTX 1650" });
    expect(matchGpu("NVIDIA GeForce GTX 1660 Ti", 6).name).toBe("GTX 1660 Ti");
    expect(matchGpu("NVIDIA GeForce GTX 1660", 6).name).toBe("GTX 1660");
  });
  it("card chính: card rời có VRAM lớn nhất", () => {
    const g = primaryGpu([
      { name: "Intel(R) UHD Graphics 770", vramBytes: 128 * 2 ** 20, pcieGen: null },
      { name: "NVIDIA GeForce RTX 4070", vramBytes: 12 * GB, pcieGen: 4 },
      { name: "Parsec Virtual Display Adapter", vramBytes: null, pcieGen: null },
    ]);
    expect(g?.name).toBe("NVIDIA GeForce RTX 4070");
  });
});

describe("mainboard", () => {
  it("chipset và khe PCIe", () => {
    expect(chipsetOf("TUF GAMING B660M-PLUS D4")).toBe("B660");
    expect(chipsetOf("MAG X870E TOMAHAWK WIFI")).toBe("X870E");
    expect(chipsetOf("PRO Z790-A WIFI")).toBe("Z790");
    expect(pcieGenOfChipset("B450")).toBe(3);
    expect(pcieGenOfChipset("B660")).toBe(4);
    expect(pcieGenOfChipset("X870E")).toBe(5);
  });
  it("tên hãng gọn", () => {
    expect(mainboardFrom({ manufacturer: "ASUSTeK COMPUTER INC.", product: "TUF GAMING B660M-PLUS D4" }))
      .toEqual({ model: "ASUS TUF GAMING B660M-PLUS D4", chipset: "B660", pcieGen: 4, pcieKnown: true });
    expect(mainboardFrom({ manufacturer: "Micro-Star International Co., Ltd.", product: "MAG B650 TOMAHAWK WIFI (MS-7D75)" }).model).toBe("MSI MAG B650 TOMAHAWK WIFI (MS-7D75)");
    expect(mainboardFrom({ manufacturer: "To Be Filled By O.E.M.", product: "To Be Filled By O.E.M." })).toMatchObject({ model: null, chipset: null, pcieKnown: false });
  });
});

describe("RAM, ổ cứng, màn hình", () => {
  it("gom thanh RAM giống nhau thành bộ", () => {
    const stick = { capacityBytes: 16 * GB, speedMhz: 3200, smbiosType: 26, formFactor: 8, partNumber: "KF432C16BB/16  ", dataWidth: 64, totalWidth: 64 };
    expect(ramKitsFrom([stick, stick], null)).toEqual([{ sticks: 2, perStickGb: 16, type: "DDR4", speedMhz: 3200, model: "KF432C16BB/16", formFactor: "dimm", ecc: false, registered: false }]);
    expect(ramKitsFrom([{ ...stick, smbiosType: 0, totalWidth: 72 }], "DDR5")[0]).toMatchObject({ type: "DDR5", ecc: true });
  });
  it("ổ: bỏ USB, NVMe theo thế hệ PCIe, đánh dấu ổ hệ điều hành", () => {
    const d = drivesFrom([
      { model: "Samsung SSD 990 PRO 1TB", sizeBytes: 1000204886016, busType: 17, mediaType: 4, isBoot: false, healthPct: 98, pcieGen: 4 },
      { model: "WDC WD10EZEX", sizeBytes: 1000204886016, busType: 11, mediaType: 3, isBoot: false, healthPct: null, pcieGen: null },
      { model: "SanDisk Ultra USB", sizeBytes: 32e9, busType: 7, mediaType: 0, isBoot: false, healthPct: null, pcieGen: null },
    ]);
    expect(d.map((x) => [x.interface, x.capacityGb, x.isBoot])).toEqual([["nvme4", 1000, true], ["hdd", 1000, false]]);
  });
  it("độ phân giải theo cạnh ngắn", () => {
    expect(resolutionOf({ width: 3440, height: 1440 })).toBe(1440);
    expect(resolutionOf({ width: 1920, height: 1200 })).toBe(1080);
    expect(resolutionOf({ width: 3840, height: 2160 })).toBe(2160);
    expect(resolutionOf(null)).toBe(1080);
  });
});

describe("tổng hợp", () => {
  const report = scanReportSchema.parse({
    tool: "f2m-scan/0.1.0",
    cpu: { name: "Intel(R) Core(TM) i5-12400F", cores: 6, threads: 12 },
    gpus: [{ name: "NVIDIA GeForce RTX 3060", vramBytes: 12 * GB, pcieGen: 4 }],
    board: { manufacturer: "Micro-Star International Co., Ltd.", product: "PRO B660M-A DDR4 (MS-7D25)" },
    ram: [{ capacityBytes: 8 * GB, speedMhz: 3200, smbiosType: 26, formFactor: 8, partNumber: "KF3200C16D4/8GX", dataWidth: 64, totalWidth: 64 },
      { capacityBytes: 8 * GB, speedMhz: 3200, smbiosType: 26, formFactor: 8, partNumber: "KF3200C16D4/8GX", dataWidth: 64, totalWidth: 64 }],
    disks: [{ model: "Samsung SSD 980 PRO 1TB", sizeBytes: 1000204886016, busType: 17, mediaType: 4, isBoot: true, healthPct: null, pcieGen: 4 }],
    display: { width: 1920, height: 1080 },
  });
  it("ra cấu hình đầy đủ khi ghép thêm nguồn", () => {
    const s = interpretScan(report);
    expect(s.cpu.name).toBe("Core i5-12400F");
    expect(s.gpu.name).toBe("RTX 3060 12GB");
    expect(s.notes).toEqual([]);
    const spec = specFromScan(s, { cpu: s.cpu.name!, gpu: s.gpu.name!, psu: { wattage: 650, model: null, rating: null } });
    expect(spec.mainboard).toEqual({ model: "MSI PRO B660M-A DDR4 (MS-7D25)", chipset: "B660", pcieGen: 4 });
    expect(spec.ram[0]).toMatchObject({ sticks: 2, perStickGb: 8 });
  });
  it("linh kiện đã khai sơ sài vẫn được coi là cùng linh kiện với bản quét chi tiết", () => {
    const had = { sticks: 2, perStickGb: 8, type: "DDR4", speedMhz: null, model: null, formFactor: "dimm", ecc: false, registered: false };
    const now = { ...had, speedMhz: 3200, model: "KF3200C16D4/8GX" };
    expect(sameScannedPart("ram", had, now, "", "")).toBe(true);
    expect(sameScannedPart("ram", { ...had, perStickGb: 16 }, now, "", "")).toBe(false);
    expect(sameScannedPart("storage", { interface: "nvme4", capacityGb: 1000, model: null }, { interface: "nvme4", capacityGb: 1000, model: "Samsung SSD 980 PRO 1TB" }, "", "")).toBe(true);
    expect(sameScannedPart("mainboard", { model: "MSI PRO B660M-A", chipset: "B660" }, { model: "MSI PRO B660M-A DDR4 (MS-7D25)", chipset: "B660" }, "", "")).toBe(true);
  });
});
