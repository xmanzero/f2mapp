import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ageParts, setup, spec } from "./helpers.js";

let t: Awaited<ReturnType<typeof setup>>;
let token: string;
beforeAll(async () => {
  t = await setup();
  token = (await t.app.inject({ method: "POST", url: "/v1/auth/register", payload: { email: "may@test.vn", password: "matkhau-dai-123", displayName: "Máy" } })).json().token;
}, 60_000);
afterAll(async () => { await t.close(); });

const req = (method: string, url: string, payload?: unknown) =>
  t.app.inject({ method: method as "GET", url, payload: payload as object, headers: { authorization: `Bearer ${token}` } });
type M = { id: string; name: string; isPrimary: boolean; input: { ramGb: number; ramChannels: number; storage: string }; parts: { kind: string; status: string; label: string; verified: boolean }[]; verified: boolean };
const machines = async () => (await req("GET", "/v1/me/machines")).json().machines as M[];

describe("cấu hình chi tiết và 2 máy", () => {
  it("máy đầu tiên là máy chính; tóm tắt tính từ chi tiết", async () => {
    const r = await req("POST", "/v1/me/machines", { name: "Máy chơi game", spec: spec({ ram: [{ sticks: 2, perStickGb: 16, type: "DDR4", speedMhz: 3600 }, { sticks: 1, perStickGb: 8, type: "DDR4", speedMhz: 3200 }] }) });
    expect(r.statusCode).toBe(201);
    const [m] = await machines();
    expect(m).toMatchObject({ name: "Máy chơi game", isPrimary: true, verified: false });
    expect(m!.input).toMatchObject({ ramGb: 40, ramChannels: 2, storage: "nvme4" });
  });

  it("đổi sức khỏe ổ: vẫn là ổ cũ; đổi RAM: bộ cũ thành 'đã thay ra'", async () => {
    const m = (await machines())[0]!;
    await ageParts(t.db);
    await req("PUT", `/v1/me/machines/${m.id}`, { spec: spec({ drives: [{ interface: "nvme4", capacityGb: 1000, model: "Samsung 980 Pro", healthPct: 90, isBoot: true }] }) });
    const after = (await machines())[0]!;
    expect(after.parts.filter((p) => p.kind === "storage" && p.status === "in_use")).toHaveLength(1);
    expect(after.parts.filter((p) => p.kind === "storage" && p.status === "replaced")).toHaveLength(0);
    // RAM 40 GB (2 bộ) → 2×8 GB: cả hai bộ cũ thành 'đã thay ra'
    expect(after.parts.filter((p) => p.kind === "ram" && p.status === "replaced").length).toBe(2);
  });

  it("sửa nhầm ngay sau khi khai (chưa xác thực, chưa đăng bán): không sinh linh kiện 'đã thay ra'", async () => {
    const m = (await machines())[0]!;
    const psuRows = () => t.db.selectFrom("machine_parts").select(["label", "status"]).where("machine_id", "=", m.id).where("kind", "=", "psu").execute();
    await req("PUT", `/v1/me/machines/${m.id}`, { spec: spec({ psu: { wattage: 650, model: "Corsiar CX650" } }) });
    await req("PUT", `/v1/me/machines/${m.id}`, { spec: spec({ psu: { wattage: 650, model: "Corsair CX650" } }) });
    const rows = await psuRows();
    expect(rows.filter((r) => r.label.includes("Corsiar"))).toEqual([]);
    expect(rows.filter((r) => r.status === "in_use")).toHaveLength(1);
  });

  it("xóa linh kiện đã thay ra khỏi kho; không xóa được linh kiện đang lắp", async () => {
    const m = (await machines())[0]!;
    const replaced = m.parts.find((p) => p.status === "replaced") as unknown as { id: string };
    const inUse = m.parts.find((p) => p.status === "in_use") as unknown as { id: string };
    expect((await req("DELETE", `/v1/me/parts/${inUse.id}`)).statusCode).toBe(409);
    expect((await req("DELETE", `/v1/me/parts/${replaced.id}`)).statusCode).toBe(200);
  });

  it("RAM không hợp máy bị chặn kèm lý do", async () => {
    const m = (await machines())[0]!;
    const ddr5OnAm4 = await req("PUT", `/v1/me/machines/${m.id}`, { spec: spec({ cpu: "Ryzen 5 5600", ram: [{ sticks: 2, perStickGb: 16, type: "DDR5" }] }) });
    expect(ddr5OnAm4.statusCode).toBe(400);
    expect(ddr5OnAm4.json().message).toContain("DDR4");
    const rdimm = await req("PUT", `/v1/me/machines/${m.id}`, { spec: spec({ ram: [{ sticks: 2, perStickGb: 16, type: "DDR4", ecc: true, registered: true }] }) });
    expect(rdimm.json().message).toContain("máy chủ");
    const laptop = await req("PUT", `/v1/me/machines/${m.id}`, { spec: spec({ ram: [{ sticks: 2, perStickGb: 16, type: "DDR4", formFactor: "sodimm" }] }) });
    expect(laptop.json().message).toContain("laptop");
  });

  it("tối đa 2 máy; đổi máy chính; không xóa máy chính khi còn máy khác", async () => {
    expect((await req("POST", "/v1/me/machines", { name: "Máy cũ", spec: spec({ cpu: "Core i3-10100F", gpu: "GTX 1650" }) })).statusCode).toBe(201);
    const third = await req("POST", "/v1/me/machines", { spec: spec() });
    expect(third.statusCode).toBe(409);
    expect(third.json().message).toContain("2 máy");
    const [a, b] = await machines();
    expect((await req("DELETE", `/v1/me/machines/${a!.id}`)).statusCode).toBe(409);
    await req("POST", `/v1/me/machines/${b!.id}/primary`);
    const ms = await machines();
    expect(ms.find((m) => m.isPrimary)!.name).toBe("Máy cũ");
    // bảng xếp hạng dùng máy chính
    const row = (await req("GET", "/v1/leaderboard")).json().items[0];
    expect(row.gpu).toBe("GTX 1650");
    expect((await req("DELETE", `/v1/me/machines/${a!.id}`)).statusCode).toBe(200);
    expect(await machines()).toHaveLength(1);
  });

  it("API cũ /v1/me/machine vẫn chạy và giữ chi tiết đã khai khi tóm tắt không đổi", async () => {
    const m = (await machines())[0]!;
    const before = m.parts.find((p) => p.kind === "psu" && p.status === "in_use")!.label;
    const old = (await req("GET", "/v1/me/machine")).json().machine;
    await req("PUT", "/v1/me/machine", { ...old, gpu: "RTX 4060" });
    const after = (await machines())[0]!;
    expect(after.parts.find((p) => p.kind === "gpu" && p.status === "in_use")!.label).toBe("RTX 4060");
    expect(after.parts.find((p) => p.kind === "psu" && p.status === "in_use")!.label).toBe(before);
  });
});
