import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ageParts, setup, spec } from "./helpers.js";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); }, 60_000);
afterAll(async () => { await t.close(); });

const req = (method: string, url: string, payload?: unknown, token?: string) =>
  t.app.inject({ method: method as "GET", url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
const register = async (email: string) =>
  (await req("POST", "/v1/auth/register", { email, password: "matkhau-dai-123", displayName: email.split("@")[0] })).json().token as string;

const GB = 2 ** 30;
const stick = { capacityBytes: 8 * GB, speedMhz: 3200, smbiosType: 26, formFactor: 8, partNumber: "KF3200C16D4/8GX", dataWidth: 64, totalWidth: 64 };
const report = (o: Record<string, unknown> = {}) => ({
  tool: "f2m-scan/0.1.0", os: "Windows 11",
  cpu: { name: "Intel(R) Core(TM) i5-12400F", cores: 6, threads: 12 },
  gpus: [{ name: "NVIDIA GeForce RTX 3060", vramBytes: 12 * GB, pcieGen: 4 }],
  board: { manufacturer: "Micro-Star International Co., Ltd.", product: "PRO B660M-A DDR4 (MS-7D25)" },
  ram: [stick, stick],
  disks: [{ model: "Samsung SSD 980 PRO 1TB", sizeBytes: 1000204886016, busType: 17, mediaType: 4, isBoot: true, healthPct: 97, pcieGen: 4 }],
  display: { width: 1920, height: 1080 }, ...o,
});
type Part = { kind: string; label: string; status: string; verified: boolean; listingId: string | null };
const machines = async (tk: string) => (await req("GET", "/v1/me/machines", undefined, tk)).json().machines as { id: string; name: string; parts: Part[]; lastScanAt: string | null; spec: { psu: { wattage: number } } }[];

describe("quét máy → gắn vào tài khoản", () => {
  it("gửi kết quả quét không cần đăng nhập: nhận mã, QR trỏ tới trang /quet, cấu hình đã nhận diện", async () => {
    const r = await req("POST", "/v1/scans", report());
    expect(r.statusCode).toBe(201);
    const b = r.json();
    expect(b.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(b.claimUrl).toMatch(new RegExp(`/quet\\?ma=${b.code}$`));
    expect(b.qr.bits).toHaveLength(b.qr.size * b.qr.size);
    expect(b.result.cpu.name).toBe("Core i5-12400F");
    // mã gõ tay có gạch, chữ thường vẫn tra được
    const g = await req("GET", `/v1/scans/${b.pretty.toLowerCase()}`);
    expect(g.json()).toMatchObject({ code: b.code, claimed: null, expired: false });
  });

  it("dữ liệu sai → 400", async () => {
    expect((await req("POST", "/v1/scans", { tool: "x" })).statusCode).toBe(400);
  });

  it("tạo máy mới: linh kiện đọc được thành xác thực, nguồn thì không; mã chỉ dùng một lần", async () => {
    const tk = await register("quet1@test.vn");
    const { code } = (await req("POST", "/v1/scans", report())).json();
    expect((await req("POST", `/v1/scans/${code}/claim`, { machineId: null })).statusCode).toBe(401);
    const c = await req("POST", `/v1/scans/${code}/claim`, { machineId: null, psuW: 650 }, tk);
    expect(c.statusCode).toBe(200);
    const m = (await machines(tk))[0]!;
    expect(m.lastScanAt).not.toBeNull();
    const v = Object.fromEntries(m.parts.map((p) => [p.kind, p.verified]));
    expect(v).toEqual({ cpu: true, gpu: true, mainboard: true, ram: true, storage: true, psu: false });
    expect(m.spec.psu.wattage).toBe(650);
    expect((await req("POST", `/v1/scans/${code}/claim`, { machineId: null }, tk)).statusCode).toBe(409);
    expect((await req("GET", `/v1/scans/${code}`)).json().claimed).toMatchObject({ handle: expect.any(String), machineName: "Máy của tôi" });
  });

  it("cập nhật máy đã khai: linh kiện khai sơ sài được giữ (kể cả tin đang bán) và bổ sung chi tiết; linh kiện khác thì thành đã thay ra", async () => {
    const tk = await register("quet2@test.vn");
    await req("POST", "/v1/me/machines", { spec: spec({
      gpu: "RTX 4070",
      mainboard: { model: null, chipset: "B660", pcieGen: 4 },
      ram: [{ sticks: 2, perStickGb: 8, type: "DDR4", speedMhz: null, model: null }],
      drives: [{ interface: "nvme4", capacityGb: 1000, model: null, healthPct: null, isBoot: true }],
    }) }, tk);
    await ageParts(t.db);
    const before = await machines(tk);
    const ram = before[0]!.parts.find((p) => p.kind === "ram")!;
    const { code } = (await req("POST", "/v1/scans", report())).json();
    expect((await req("POST", `/v1/scans/${code}/claim`, { machineId: before[0]!.id }, tk)).statusCode).toBe(200);
    const m = (await machines(tk))[0]!;
    const inUse = m.parts.filter((p) => p.status === "in_use");
    expect(inUse.find((p) => p.kind === "ram")).toMatchObject({ label: "KF3200C16D4/8GX · 2×8 GB DDR4 3200 MHz", verified: true });
    expect(m.parts.filter((p) => p.kind === "ram")).toHaveLength(1); // không sinh "RAM đã thay ra" ảo
    expect(inUse.find((p) => p.kind === "gpu")).toMatchObject({ label: "RTX 3060 12GB", verified: true });
    expect(m.parts.find((p) => p.kind === "gpu" && p.status === "replaced")?.label).toBe("RTX 4070");
    expect(inUse.find((p) => p.kind === "psu")).toMatchObject({ label: "Nguồn 650 W · Corsair CX650 (80 Plus Bronze)", verified: false });
    expect(m.spec.psu.wattage).toBe(650);
    expect(ram.label).toBe("2×8 GB DDR4");
  });

  it("CPU / card chưa có trong danh mục: phải chọn mẫu gần nhất, mẫu tự chọn không được xác thực", async () => {
    const tk = await register("quet3@test.vn");
    const r = (await req("POST", "/v1/scans", report({ cpu: { name: "Intel(R) Core(TM) i7-14700", cores: 20, threads: 28 }, gpus: [{ name: "NVIDIA GeForce GTX 1660 Ti", vramBytes: 6 * GB, pcieGen: 3 }] }))).json();
    expect(r.result.cpu).toMatchObject({ name: null, suggestion: "Core i7-14700K" });
    expect(r.result.gpu).toMatchObject({ name: null, suggestion: "GTX 1660 Super" });
    expect((await req("POST", `/v1/scans/${r.code}/claim`, { machineId: null }, tk)).statusCode).toBe(400);
    expect((await req("POST", `/v1/scans/${r.code}/claim`, { machineId: null, cpu: "Core i7-14700K", gpu: "GTX 1660 Super" }, tk)).statusCode).toBe(200);
    const v = Object.fromEntries((await machines(tk))[0]!.parts.map((p) => [p.kind, p.verified]));
    expect(v).toMatchObject({ cpu: false, gpu: false, mainboard: true, ram: true });
  });

  it("đã có 2 máy thì không tạo được máy thứ ba", async () => {
    const tk = await register("quet4@test.vn");
    await req("POST", "/v1/me/machines", { spec: spec() }, tk);
    await req("POST", "/v1/me/machines", { spec: spec() }, tk);
    const { code } = (await req("POST", "/v1/scans", report())).json();
    const c = await req("POST", `/v1/scans/${code}/claim`, { machineId: null }, tk);
    expect(c.statusCode).toBe(409);
    expect(c.json().message).toMatch(/Xóa bớt một máy/);
    // mã vẫn dùng được cho lựa chọn khác
    const ms = await machines(tk);
    expect((await req("POST", `/v1/scans/${code}/claim`, { machineId: ms[1]!.id }, tk)).statusCode).toBe(200);
  });

  it("mã hết hạn → 410", async () => {
    const tk = await register("quet5@test.vn");
    const { code } = (await req("POST", "/v1/scans", report())).json();
    await t.db.updateTable("scans").set({ expires_at: new Date(Date.now() - 1000) }).where("code", "=", code).execute();
    expect((await req("GET", `/v1/scans/${code}`)).json().expired).toBe(true);
    expect((await req("POST", `/v1/scans/${code}/claim`, { machineId: null }, tk)).statusCode).toBe(410);
  });
});
