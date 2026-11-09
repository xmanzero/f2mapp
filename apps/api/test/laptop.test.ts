import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setup, spec } from "./helpers.js";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); }, 60_000);
afterAll(async () => { await t.close(); });

const req = (method: string, url: string, payload?: unknown, token?: string) =>
  t.app.inject({ method: method as "GET", url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
const register = async (email: string) => {
  const r = (await req("POST", "/v1/auth/register", { email, password: "matkhau-dai-123", displayName: email.split("@")[0] })).json();
  return { token: r.token as string, handle: r.user.handle as string };
};
const GB = 2 ** 30;
const laptopSpec = (o: Record<string, unknown> = {}) => spec({
  cpu: "Core i7-13620H", gpu: "RTX 4060 Laptop", formFactor: "laptop", gpuTgpW: 140, laptopModel: "ASUS TUF Gaming F15",
  mainboard: { model: "FX507VV", chipset: null, pcieGen: 4 }, psu: { wattage: 240, model: null, rating: null },
  ram: [{ sticks: 2, perStickGb: 8, type: "DDR5", speedMhz: 4800, model: null, formFactor: "sodimm" }], ...o,
});
type M = { id: string; spec: { formFactor?: string; gpuTgpW?: number; laptopModel?: string }; power: number; parts: { id: string; kind: string }[] };

describe("laptop", () => {
  it("lưu laptop: giữ loại máy, TGP, model; TGP thấp → điểm thấp hơn; bảng xếp hạng có cờ laptop", async () => {
    const a = await register("laptopA@test.vn");
    expect((await req("POST", "/v1/me/machines", { spec: laptopSpec() }, a.token)).statusCode).toBeLessThan(300);
    const m = (await req("GET", "/v1/me/machines", undefined, a.token)).json().machines[0] as M;
    expect(m.spec).toMatchObject({ formFactor: "laptop", gpuTgpW: 140, laptopModel: "ASUS TUF Gaming F15" });
    const hi = m.power;
    await req("PUT", `/v1/me/machines/${m.id}`, { spec: laptopSpec({ gpuTgpW: 60 }) }, a.token);
    const lo = ((await req("GET", "/v1/me/machines", undefined, a.token)).json().machines[0] as M).power;
    expect(lo).toBeLessThan(hi);
    const board = (await req("GET", "/v1/leaderboard")).json().items as { handle: string; laptop: unknown; power: number }[];
    expect(board.find((x) => x.handle === a.handle)).toMatchObject({ laptop: { model: "ASUS TUF Gaming F15" }, power: lo });
    const p = (await req("GET", `/v1/users/${a.handle}`)).json();
    expect(p.rank).toMatchObject({ rank: 1, laptop: true });
  });

  it("không bán rời CPU / card của laptop; RAM thì được", async () => {
    const b = await register("laptopB@test.vn");
    await req("POST", "/v1/me/machines", { spec: laptopSpec() }, b.token);
    const m = (await req("GET", "/v1/me/machines", undefined, b.token)).json().machines[0] as M;
    const listing = (kind: string) => ({ machinePartId: m.parts.find((x) => x.kind === kind)!.id, priceVnd: 1_000_000, condition: "used", province: "Hà Nội", contact: "0900000000", durationDays: 7 });
    const gpu = await req("POST", "/v1/listings", listing("gpu"), b.token);
    expect(gpu.statusCode).toBe(400);
    expect(gpu.json().message).toContain("laptop");
    expect((await req("POST", "/v1/listings", listing("ram"), b.token)).statusCode).toBeLessThan(300);
  });

  it("quét laptop → máy mới là laptop, TGP từ nvidia-smi", async () => {
    const c = await register("laptopC@test.vn");
    const r = (await req("POST", "/v1/scans", {
      tool: "pcdex-scan/0.7.0", chassis: "laptop", system: { manufacturer: "LENOVO", model: "Legion 5 15ARH7H" },
      cpu: { name: "AMD Ryzen 7 6800H with Radeon Graphics", cores: 8, threads: 16 },
      gpus: [{ name: "NVIDIA GeForce RTX 3060 Laptop GPU", vramBytes: 6 * GB, tgpW: 130 }, { name: "AMD Radeon(TM) Graphics", vramBytes: 512 * 2 ** 20 }],
      board: { manufacturer: "LENOVO", product: "LNVNB161216" },
      ram: [{ capacityBytes: 8 * GB, speedMhz: 4800, smbiosType: 34, formFactor: 12 }, { capacityBytes: 8 * GB, speedMhz: 4800, smbiosType: 34, formFactor: 12 }],
      disks: [{ model: "SAMSUNG MZVL2512HCJQ", sizeBytes: 512110190592, busType: 17, mediaType: 4, isBoot: true, pcieGen: 4 }],
    })).json();
    expect(r.result.laptop).toEqual({ model: "Lenovo Legion 5 15ARH7H", gpuTgpW: 130 });
    expect((await req("POST", `/v1/scans/${r.code}/claim`, { machineId: null }, c.token)).statusCode).toBe(200);
    const m = (await req("GET", "/v1/me/machines", undefined, c.token)).json().machines[0] as M;
    expect(m.spec).toMatchObject({ formFactor: "laptop", gpuTgpW: 130, laptopModel: "Lenovo Legion 5 15ARH7H" });
  });
});
