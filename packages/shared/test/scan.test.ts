import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  chipsetOf, drivesFrom, interpretScan, mainboardFrom, matchCpu, matchGpu, pcieGenOfChipset, primaryGpu, ramKitsFrom, resolutionOf,
  sameScannedPart, scanReportSchema, specFromScan, benchForSpec, BLENDER_REF, BENCH_OFFICIAL, measuredRender, resolveMachine, hardwareFindings, suggestUpgrades,
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
    expect(matchCpu("Intel(R) Core(TM) i5-13500")).toMatchObject({ name: null, suggestion: "Core i5-13400F" });
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
    expect(matchGpu("NVIDIA GeForce GTX 960", 4).name).toBeNull();
    expect(matchGpu("NVIDIA GeForce GTX 1650 SUPER", 4).name).toBe("GTX 1650 Super");
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

describe("đo hiệu năng (Blender Benchmark)", () => {
  // số đo thật: i7-14700 + GTX 1660 Ti, Blender 4.5.0, benchmark-launcher-cli 3.3.0 (09/11/2026)
  const cpuRun = { name: "Intel Core i7-14700", type: "CPU", scenes: { monster: 122.16189338906506, junkshop: 84.96790057622727, classroom: 63.29469203040549 } };
  const base = {
    tool: "pcdex-scan/0.5.0",
    cpu: { name: "Intel(R) Core(TM) i7-14700", cores: 20, threads: 28 },
    gpus: [{ name: "NVIDIA GeForce GTX 1660 Ti", vramBytes: 6 * GB, pcieGen: 3 }],
    board: { manufacturer: "ASUSTeK COMPUTER INC.", product: "TUF GAMING B660M-PLUS D4" },
    ram: [], disks: [],
  };
  it("quy số đo về thang render và so với trung bình của đúng mẫu", () => {
    const s = interpretScan(scanReportSchema.parse({ ...base, bench: { blender: "4.5.0", cpu: cpuRun } }));
    expect(s.bench?.cpu).toMatchObject({ part: "Core i7-14700", score: 270.4, points: 17364, expected: 19277, pct: 90 });
    expect(s.bench?.gpu).toBeNull();
  });
  it("bỏ số đo của thiết bị khác, sai phiên bản Blender, hoặc sai loại", () => {
    const other = { ...cpuRun, name: "AMD Ryzen 7 7800X3D 8-Core Processor" };
    expect(interpretScan(scanReportSchema.parse({ ...base, bench: { blender: "4.5.0", cpu: other } })).bench).toBeNull();
    expect(interpretScan(scanReportSchema.parse({ ...base, bench: { blender: "4.2.0", cpu: cpuRun } })).bench).toBeNull();
    expect(interpretScan(scanReportSchema.parse({ ...base, bench: { blender: "4.5.0", gpu: cpuRun } })).bench).toBeNull();
    expect(() => scanReportSchema.parse({ ...base, bench: { blender: "4.5.0", cpu: { ...cpuRun, scenes: { monster: -1, junkshop: 1, classroom: 1 } } } })).toThrow();
  });
  it("card đo bằng CUDA thì ghi điểm nhưng không so (dữ liệu so sánh dùng OptiX)", () => {
    const gpu = { name: "NVIDIA GeForce GTX 1660 Ti", type: "CUDA", scenes: { monster: 300, junkshop: 200, classroom: 150 } };
    const b = interpretScan(scanReportSchema.parse({ ...base, bench: { blender: "4.5.0", gpu } })).bench;
    expect(b?.gpu).toMatchObject({ part: "GTX 1660 Ti", score: 650, expected: null, pct: null });
    expect(benchForSpec(b, { cpu: "Core i7-14700", gpu: "GTX 1660 Ti" })?.gpu?.part).toBe("GTX 1660 Ti");
    // đổi card sau khi đo → số đo cũ không còn hiện
    expect(benchForSpec(b, { cpu: "Core i7-14700", gpu: "RTX 3060 12GB" })).toBeNull();
  });
  it("mốc quy đổi khớp dữ liệu Blender Open Data", () => {
    const rows = JSON.parse(readFileSync(new URL("../../../data/blender-render-4.5.json", import.meta.url), "utf-8")).rows as { kind: string; name: string; score: number }[];
    expect(rows.find((r) => r.name === "Core i5-12400F")?.score).toBe(BLENDER_REF.cpu);
    expect(rows.find((r) => r.kind === "gpu" && r.name === "RTX 3060")?.score).toBe(BLENDER_REF.gpu);
  });
});

describe("danh mục mở rộng (09/11/2026)", () => {
  it("bản F và bản thường dùng chung số liệu", () => {
    expect(matchCpu("12th Gen Intel(R) Core(TM) i5-12400")).toMatchObject({ name: "Core i5-12400F", equivalent: true });
    expect(matchCpu("Intel(R) Core(TM) i7-10700")).toMatchObject({ name: "Core i7-10700F", equivalent: true });
    expect(matchCpu("Intel(R) Core(TM) i3-12100").name).toBe("Core i3-12100F");
    expect(matchCpu("Intel(R) Core(TM) i7-14700").name).toBe("Core i7-14700");
  });
  it("CPU đời cũ và AMD có đuôi lạ", () => {
    expect(matchCpu("Intel(R) Core(TM) i7-8700K CPU @ 3.70GHz").name).toBe("Core i7-8700K");
    expect(matchCpu("AMD Ryzen 5 2600 Six-Core Processor").name).toBe("Ryzen 5 2600");
    expect(matchCpu("AMD Ryzen 7 5700G with Radeon Graphics").name).toBe("Ryzen 7 5700G");
  });
  it("card đời cũ: Series, bản VRAM", () => {
    expect(matchGpu("AMD Radeon RX 580 Series", 8).name).toBe("RX 580 8GB");
    expect(matchGpu("NVIDIA GeForce RTX 2060 SUPER", 8).name).toBe("RTX 2060 Super");
    expect(matchGpu("NVIDIA GeForce RTX 3060", 8).name).toBe("RTX 3060 8GB");
    expect(matchGpu("NVIDIA GeForce RTX 2060", 12).name).toBe("RTX 2060 12GB");
    expect(matchGpu("NVIDIA GeForce GTX 1060 3GB", 3).name).toBe("GTX 1060 3GB");
  });
});

describe("xác minh số đo hiệu năng", () => {
  // kết quả gốc thật (i7-14700, 09/11/2026)
  const runs = [
    { scene: "monster", sceneChecksum: BENCH_OFFICIAL.scenes.monster, samples: 65, seconds: 31.924849, timeLimit: 30 },
    { scene: "junkshop", sceneChecksum: BENCH_OFFICIAL.scenes.junkshop, samples: 43, seconds: 30.364408, timeLimit: 30 },
    { scene: "classroom", sceneChecksum: BENCH_OFFICIAL.scenes.classroom, samples: 33, seconds: 31.282244, timeLimit: 30 },
  ];
  const scenes = { monster: 122.16189338906506, junkshop: 84.96790057622727, classroom: 63.29469203040549 };
  const bench = (o: Record<string, unknown> = {}, dev: Record<string, unknown> = {}) => ({
    blender: "4.5.0", launcher: "3.3.0", launcherChecksum: BENCH_OFFICIAL.launcher["3.3.0"], script: "3.1.2",
    scriptChecksum: BENCH_OFFICIAL.script["3.1.2"], blenderChecksum: BENCH_OFFICIAL.blender, nonce: "n",
    cpu: { name: "Intel Core i7-14700", type: "CPU", threads: 28, scenes, runs, ...dev }, ...o,
  });
  const base = {
    tool: "pcdex-scan/0.6.0", cpu: { name: "Intel(R) Core(TM) i7-14700", cores: 20, threads: 28 },
    gpus: [{ name: "NVIDIA GeForce GTX 1660 Ti", vramBytes: 6 * GB }], board: { manufacturer: "ASUS", product: "TUF GAMING B660M-PLUS D4" }, ram: [], disks: [],
  };
  const cpuOf = (b: unknown, nonceOk = true) => interpretScan(scanReportSchema.parse({ ...base, bench: b }), { nonceOk }).bench?.cpu;

  it("kết quả gốc khớp, đúng bản chính thức, có mã đo → đã xác minh, dùng để tính điểm", () => {
    const c = cpuOf(bench());
    expect(c).toMatchObject({ trust: "verified", flags: [], pct: 90 });
    const r = interpretScan(scanReportSchema.parse({ ...base, bench: bench() }), { nonceOk: true }).bench;
    expect(measuredRender(r)).toEqual({ cpu: 17364 });
  });
  it("sửa điểm mà không sửa kết quả gốc → không khớp", () => {
    expect(cpuOf(bench({}, { scenes: { ...scenes, monster: 200 } }))?.flags).toContain("inconsistent");
  });
  it("thiếu kết quả gốc (bản phần mềm cũ), sai checksum, không có mã đo, sai số luồng", () => {
    expect(cpuOf(bench({}, { runs: undefined }))?.flags).toEqual(["no_runs"]);
    expect(cpuOf(bench({ blenderChecksum: "abcdef12" }))?.flags).toContain("checksum");
    expect(cpuOf(bench(), false)?.flags).toEqual(["nonce"]);
    expect(cpuOf(bench({}, { threads: 16 }))?.flags).toContain("threads");
    expect(measuredRender(interpretScan(scanReportSchema.parse({ ...base, bench: bench() }), { nonceOk: false }).bench)).toBeUndefined();
  });
  it("kết quả bất thường so với trung bình cùng mẫu → chưa xác minh", () => {
    const k = 1.6; // 144% trung bình — vượt khoảng 60–130% của mẫu có số Blender
    const big = { monster: scenes.monster * k, junkshop: scenes.junkshop * k, classroom: scenes.classroom * k };
    const bigRuns = runs.map((r) => ({ ...r, samples: Math.round(r.samples * k) }));
    const c = cpuOf(bench({}, { scenes: { monster: bigRuns[0]!.samples / runs[0]!.seconds * 60, junkshop: bigRuns[1]!.samples / runs[1]!.seconds * 60, classroom: bigRuns[2]!.samples / runs[2]!.seconds * 60 }, runs: bigRuns }));
    expect(big.monster).toBeGreaterThan(0);
    expect(c).toMatchObject({ trust: "unverified", flags: ["outlier"] });
  });
  it("số đo chỉ kéo điểm render lệch tối đa ±25%", () => {
    const base12400 = resolveMachine({ cpu: "Core i5-12400F", gpu: "RTX 3060 12GB", ramGb: 16, ramChannels: 2, storage: "nvme4", pcieGen: 4, psuW: 550, resolution: 1080 });
    const hi = resolveMachine({ ...base12400, cpu: "Core i5-12400F", gpu: "RTX 3060 12GB" }, { cpu: 99999, gpu: 1 });
    expect(hi.cpu.render).toBe(12500);
    expect(hi.gpu.render).toBe(7500);
  });
});

describe("laptop", () => {
  it("nhận diện CPU / card laptop và đồ họa tích hợp đời mới", () => {
    expect(matchCpu("13th Gen Intel(R) Core(TM) i7-13620H").name).toBe("Core i7-13620H");
    expect(matchCpu("AMD Ryzen 7 7840HS w/ Radeon 780M Graphics").name).toBe("Ryzen 7 7840HS");
    expect(matchCpu("AMD Ryzen AI 9 HX 370 w/ Radeon 890M").name).toBe("Ryzen AI 9 HX 370");
    expect(matchCpu("Intel(R) Core(TM) Ultra 7 155H").name).toBe("Core Ultra 7 155H");
    expect(matchGpu("NVIDIA GeForce RTX 4060 Laptop GPU", 8).name).toBe("RTX 4060 Laptop");
    expect(matchGpu("AMD Radeon RX 7600S", 8).name).toBe("RX 7600S");
    expect(matchGpu("AMD Radeon 780M Graphics", null).name).toBe("Radeon 780M");
    expect(matchGpu("Intel(R) Arc(TM) Graphics", null).name).toBe("Arc Graphics");
    expect(matchGpu("Intel(R) Iris(R) Xe Graphics", null).name).toBe("Iris Xe Graphics");
    expect(matchGpu("Intel(R) UHD Graphics 770", null).name).toBe("Đồ họa tích hợp (iGPU)");
    // CPU laptop chưa có thì gợi ý CPU laptop, máy bàn thì gợi ý máy bàn
    expect(matchCpu("Intel(R) Core(TM) i5-12400").name).toBe("Core i5-12400F");
  });
  it("bản quét laptop: tên model, TGP đọc được trong dải của mẫu", () => {
    const s = interpretScan(scanReportSchema.parse({
      tool: "pcdex-scan/0.6.0", chassis: "laptop", system: { manufacturer: "ASUSTeK COMPUTER INC.", model: "TUF Gaming A15 FA507NV_FA507NV" },
      cpu: { name: "AMD Ryzen 7 7735HS with Radeon Graphics", cores: 8, threads: 16 },
      gpus: [{ name: "AMD Radeon(TM) Graphics", vramBytes: 512 * 2 ** 20 }, { name: "NVIDIA GeForce RTX 4060 Laptop GPU", vramBytes: 8 * GB, tgpW: 140 }],
      board: { manufacturer: "ASUSTeK COMPUTER INC.", product: "FA507NV" }, ram: [], disks: [],
    }));
    expect(s.cpu.name).toBe("Ryzen 7 7735HS");
    expect(s.gpu.name).toBe("RTX 4060 Laptop");
    expect(s.laptop).toEqual({ model: "ASUS TUF Gaming A15 FA507NV_FA507NV", gpuTgpW: 140 });
    expect(s.notes).not.toContain("Chưa nhận ra chipset mainboard, tạm tính khe card PCIe 4.0 — sửa lại ở trang cấu hình nếu sai.");
    const spec = specFromScan(s, { cpu: s.cpu.name!, gpu: s.gpu.name!, psu: { wattage: 200, model: null, rating: null } });
    expect(spec).toMatchObject({ formFactor: "laptop", gpuTgpW: 140 });
  });
  it("TGP thấp → yếu hơn; laptop không có luật nguồn, chỉ gợi ý RAM / ổ", () => {
    const base = { cpu: "Core i7-13620H", gpu: "RTX 4060 Laptop", ramGb: 8, ramChannels: 1 as const, storage: "nvme4" as const, pcieGen: 4 as const, psuW: 120, resolution: 1080 as const, laptop: true };
    const hi = resolveMachine({ ...base, gpuTgpW: 140 }), lo = resolveMachine({ ...base, gpuTgpW: 60 });
    expect(lo.gpu.fps["1080"]).toBeLessThan(hi.gpu.fps["1080"] * 0.75);
    expect(lo.gpu.fps["1080"]).toBeGreaterThan(hi.gpu.fps["1080"] * 0.65);
    expect(hi.laptop).toBe(true);
    expect(hardwareFindings(hi).map((f) => f.code)).not.toContain("psu_low");
    expect(suggestUpgrades(hi).map((x) => x.kind)).toEqual(["ram"]);
    // máy bàn không được gợi ý card / CPU laptop
    const desk = suggestUpgrades(resolveMachine({ cpu: "Core i3-10100F", gpu: "GTX 1650", ramGb: 16, ramChannels: 2, storage: "nvme3", pcieGen: 3, psuW: 650, resolution: 1080 }));
    expect(desk.every((x) => !x.next.gpu.mobile && !x.next.cpu.mobile)).toBe(true);
  });
});
