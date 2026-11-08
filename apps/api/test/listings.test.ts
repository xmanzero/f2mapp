import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ageParts, setup, spec } from "./helpers.js";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); }, 60_000);
afterAll(async () => { await t.close(); });

const req = (method: string, url: string, payload?: unknown, token?: string) =>
  t.app.inject({ method: method as "GET", url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
const register = async (email: string) =>
  (await req("POST", "/v1/auth/register", { email, password: "matkhau-dai-123", displayName: email.split("@")[0] })).json().token as string;

const sale = { priceVnd: 4_300_000, condition: "used", warrantyMonths: 0, province: "Hà Nội", contact: "0912345678", description: "Zin" };
type Part = { id: string; kind: string; label: string; inUse: boolean; verified: boolean; listingId: string | null };
const partsOf = async (token: string) => (await req("GET", "/v1/me/listings", undefined, token)).json().parts as Part[];

describe("chỉ bán linh kiện mình sở hữu", () => {
  let seller: string, buyer: string;
  beforeAll(async () => {
    seller = await register("ban@test.vn");
    buyer = await register("mua@test.vn");
    await req("POST", "/v1/me/machines", { spec: spec() }, seller);
  });

  it("danh sách linh kiện bán được: đủ 6 loại trong máy, đang lắp, chưa xác thực", async () => {
    const parts = await partsOf(seller);
    expect(parts.map((p) => p.kind).sort()).toEqual(["cpu", "gpu", "mainboard", "psu", "ram", "storage"]);
    expect(parts.every((p) => p.inUse && !p.verified)).toBe(true);
    expect(parts.find((p) => p.kind === "ram")!.label).toBe("Kingston Fury · 2×8 GB DDR4 3200 MHz");
  });

  it("bán linh kiện đang lắp: tin ghi rõ nguồn gốc và trạng thái chưa xác thực; liên hệ chỉ cho người đăng nhập", async () => {
    const gpu = (await partsOf(seller)).find((p) => p.kind === "gpu")!;
    const r = await req("POST", "/v1/listings", { ...sale, machinePartId: gpu.id }, seller);
    expect(r.statusCode).toBe(201);
    const item = r.json().item;
    expect(item).toMatchObject({ name: "RTX 3060 12GB", kind: "gpu", inCatalog: true });
    expect(item.source).toMatchObject({ inUse: true, verified: false, machine: "Core i5-12400F + RTX 3060 12GB" });
    expect((await req("GET", `/v1/listings/${item.id}`)).json().item.contact).toBeNull();
    expect((await req("GET", `/v1/listings/${item.id}`, undefined, buyer)).json().item.contact).toBe("0912345678");
    // một linh kiện một tin
    expect((await req("POST", "/v1/listings", { ...sale, machinePartId: gpu.id }, seller)).statusCode).toBe(409);
  });

  it("không đăng được linh kiện của người khác, cũng không có đường nhập tên tự do", async () => {
    const someone = (await partsOf(seller))[0]!.id;
    expect((await req("POST", "/v1/listings", { ...sale, machinePartId: someone }, buyer)).statusCode).toBe(400);
    const free = await req("POST", "/v1/listings", { ...sale, kind: "gpu", partName: "RTX 4090" }, buyer);
    expect(free.statusCode).toBe(400);
    expect(free.json().message).toContain("linh kiện");
  });

  it("RAM, ổ cứng, nguồn, mainboard đều bán được, tên lấy từ khai báo", async () => {
    const parts = await partsOf(seller);
    for (const kind of ["ram", "storage", "psu", "mainboard"]) {
      const p = parts.find((x) => x.kind === kind)!;
      const r = await req("POST", "/v1/listings", { ...sale, priceVnd: 500_000, machinePartId: p.id }, seller);
      expect(r.statusCode, kind).toBe(201);
      expect(r.json().item.name).toBe(p.label);
    }
  });

  it("tối đa 5 tin mỗi ngày", async () => {
    // người bán đã đăng 5 tin ở các test trên
    const cpu = (await partsOf(seller)).find((p) => p.kind === "cpu")!;
    const r = await req("POST", "/v1/listings", { ...sale, machinePartId: cpu.id }, seller);
    expect(r.statusCode).toBe(429);
    expect(r.json().message).toContain("5 tin");
  });

  it("bán xong linh kiện đang lắp: máy báo thiếu card, vẫn giữ để tính điểm tới khi khai linh kiện thay thế", async () => {
    const gpu = (await partsOf(seller)).find((p) => p.kind === "gpu")!;
    await req("PATCH", `/v1/listings/${gpu.listingId}`, { status: "sold" }, seller);
    const m = (await req("GET", "/v1/me/machines", undefined, seller)).json().machines[0];
    expect(m.missing).toEqual(["gpu"]);
    expect(m.spec.gpu).toBe("RTX 3060 12GB");
    await req("PUT", `/v1/me/machines/${m.id}`, { spec: spec({ gpu: "RTX 4060" }) }, seller);
    const after = (await req("GET", "/v1/me/machines", undefined, seller)).json().machines[0];
    expect(after.missing).toEqual([]);
    expect(after.spec.gpu).toBe("RTX 4060");
  });
});

describe("linh kiện đã thay ra", () => {
  it("thay card → card cũ vẫn bán được; đăng bán → ẩn tin thì về kho → bán thì 'sold'", async () => {
    const token = await register("nangcap@test.vn");
    await req("POST", "/v1/me/machines", { spec: spec({ gpu: "GTX 1660 Super" }) }, token);
    const m = (await req("GET", "/v1/me/machines", undefined, token)).json().machines[0];
    await ageParts(t.db);
    await req("PUT", `/v1/me/machines/${m.id}`, { spec: spec({ gpu: "RTX 4060" }) }, token);
    const old = (await partsOf(token)).find((p) => p.label === "GTX 1660 Super")!;
    expect(old.inUse).toBe(false);

    const id = (await req("POST", "/v1/listings", { ...sale, priceVnd: 1_900_000, machinePartId: old.id }, token)).json().item.id;
    const status = async () => (await t.db.selectFrom("machine_parts").select("status").where("id", "=", old.id).executeTakeFirstOrThrow()).status;
    expect(await status()).toBe("for_sale");
    await req("PATCH", `/v1/listings/${id}`, { status: "hidden" }, token);
    expect(await status()).toBe("replaced");
    await req("PATCH", `/v1/listings/${id}`, { status: "sold" }, token);
    expect(await status()).toBe("sold");
    expect((await req("GET", "/v1/listings")).json().items.map((x: { id: string }) => x.id)).not.toContain(id);
  });

  it("người khác không sửa được tin", async () => {
    const a = await register("chu@test.vn");
    const b = await register("khac@test.vn");
    await req("POST", "/v1/me/machines", { spec: spec() }, a);
    const p = (await partsOf(a))[0]!;
    const id = (await req("POST", "/v1/listings", { ...sale, machinePartId: p.id }, a)).json().item.id;
    expect((await req("PATCH", `/v1/listings/${id}`, { priceVnd: 2_000_000 }, b)).statusCode).toBe(403);
  });
});
