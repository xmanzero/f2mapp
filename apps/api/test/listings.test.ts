import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setup } from "./helpers.js";

let t: Awaited<ReturnType<typeof setup>>;
let seller: string, buyer: string;
beforeAll(async () => {
  t = await setup();
  const reg = async (email: string) =>
    (await t.app.inject({ method: "POST", url: "/v1/auth/register", payload: { email, password: "matkhau-dai-123", displayName: email.split("@")[0] } })).json().token;
  seller = await reg("nguoiban@test.vn");
  buyer = await reg("nguoimua@test.vn");
}, 60_000);
afterAll(async () => { await t.close(); });

const req = (method: string, url: string, payload?: unknown, token?: string) =>
  t.app.inject({ method: method as "GET", url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
const gpuListing = { kind: "gpu", partName: "RTX 3060 12GB", priceVnd: 4_300_000, condition: "used", warrantyMonths: 0, province: "Hà Nội", contact: "0912345678", description: "Card zin, chưa sửa" };

describe("đăng tin", () => {
  it("cần đăng nhập", async () => {
    expect((await req("POST", "/v1/listings", gpuListing)).statusCode).toBe(401);
  });

  it("card trong danh mục: đăng được, ai cũng thấy, liên hệ chỉ hiện cho người đã đăng nhập", async () => {
    const r = await req("POST", "/v1/listings", gpuListing, seller);
    expect(r.statusCode).toBe(201);
    const id = r.json().item.id;
    const guest = (await req("GET", `/v1/listings/${id}`)).json().item;
    expect(guest).toMatchObject({ name: "RTX 3060 12GB", priceVnd: 4_300_000, contact: null, contactHidden: true, inCatalog: true });
    const logged = (await req("GET", `/v1/listings/${id}`, undefined, buyer)).json().item;
    expect(logged.contact).toBe("0912345678");
    expect(logged.mine).toBe(false);
    expect((await req("GET", "/v1/listings")).json().items.map((x: { id: string }) => x.id)).toContain(id);
  });

  it("card không có trong danh mục bị từ chối; RAM phải có tên", async () => {
    expect((await req("POST", "/v1/listings", { ...gpuListing, partName: "GTX 480" }, seller)).statusCode).toBe(400);
    const ram = await req("POST", "/v1/listings", { ...gpuListing, kind: "ram", partName: undefined }, seller);
    expect(ram.statusCode).toBe(400);
    expect(ram.json().message).toContain("DDR4");
    const ok = await req("POST", "/v1/listings", { ...gpuListing, kind: "ram", partName: undefined, title: "DDR4 16 GB (2×8 GB) 3200 MHz", priceVnd: 650_000 }, seller);
    expect(ok.json().item).toMatchObject({ name: "DDR4 16 GB (2×8 GB) 3200 MHz", inCatalog: false });
  });

  it("giá ngoài khoảng và thiếu liên hệ báo lỗi bằng lời", async () => {
    const cheap = await req("POST", "/v1/listings", { ...gpuListing, priceVnd: 5000 }, seller);
    expect(cheap.json().message).toContain("10.000");
    const noContact = await req("POST", "/v1/listings", { ...gpuListing, contact: "" }, seller);
    expect(noContact.json().message).toContain("Zalo");
  });

  it("tìm theo tên và lọc theo loại", async () => {
    const found = (await req("GET", "/v1/listings?q=3060")).json().items;
    expect(found.every((x: { name: string }) => x.name.includes("3060"))).toBe(true);
    const rams = (await req("GET", "/v1/listings?kind=ram")).json().items;
    expect(rams.length).toBeGreaterThan(0);
    expect(rams.every((x: { kind: string }) => x.kind === "ram")).toBe(true);
  });
});

describe("quản lý tin", () => {
  it("người khác không sửa được; chủ tin đổi giá, đánh dấu đã bán thì tin rời khỏi chợ", async () => {
    const id = (await req("POST", "/v1/listings", { ...gpuListing, partName: "RX 6600", priceVnd: 2_900_000 }, seller)).json().item.id;
    expect((await req("PATCH", `/v1/listings/${id}`, { priceVnd: 1 }, buyer)).statusCode).toBe(400);
    expect((await req("PATCH", `/v1/listings/${id}`, { priceVnd: 2_700_000 }, buyer)).statusCode).toBe(403);
    expect((await req("PATCH", `/v1/listings/${id}`, { priceVnd: 2_700_000 }, seller)).json().item.priceVnd).toBe(2_700_000);
    await req("PATCH", `/v1/listings/${id}`, { status: "sold" }, seller);
    expect((await req("GET", "/v1/listings")).json().items.map((x: { id: string }) => x.id)).not.toContain(id);
    expect((await req("GET", "/v1/me/listings", undefined, seller)).json().items.find((x: { id: string }) => x.id === id).status).toBe("sold");
  });

  it("tin ẩn: người khác không xem được, chủ tin vẫn thấy", async () => {
    const id = (await req("POST", "/v1/listings", { ...gpuListing, partName: "RTX 3070" }, seller)).json().item.id;
    await req("PATCH", `/v1/listings/${id}`, { status: "hidden" }, seller);
    expect((await req("GET", `/v1/listings/${id}`, undefined, buyer)).statusCode).toBe(404);
    expect((await req("GET", `/v1/listings/${id}`, undefined, seller)).statusCode).toBe(200);
  });
});

describe("đăng bán linh kiện đã thay ra khỏi máy", () => {
  it("thay card → card cũ trong danh sách 'đã thay ra' → đăng bán → bán xong thì linh kiện thành 'sold'", async () => {
    const token = (await t.app.inject({ method: "POST", url: "/v1/auth/register",
      payload: { email: "nangcap@test.vn", password: "matkhau-dai-123", displayName: "Nâng cấp" } })).json().token;
    const machine = { cpu: "Core i5-12400F", gpu: "GTX 1660 Super", ramGb: 16, ramChannels: 2, storage: "nvme3", pcieGen: 4, psuW: 650, resolution: 1080 };
    await req("PUT", "/v1/me/machine", machine, token);
    await req("PUT", "/v1/me/machine", { ...machine, gpu: "RTX 4060" }, token);

    const replaced = (await req("GET", "/v1/me/listings", undefined, token)).json().replacedParts;
    expect(replaced).toEqual([expect.objectContaining({ kind: "gpu", name: "GTX 1660 Super" })]);

    const posted = await req("POST", "/v1/listings", { ...gpuListing, partName: "GTX 1660 Super", priceVnd: 1_900_000, machinePartId: replaced[0].id }, token);
    expect(posted.statusCode).toBe(201);
    // đăng rồi thì không còn trong danh sách gợi ý, và không đăng lần hai được
    expect((await req("GET", "/v1/me/listings", undefined, token)).json().replacedParts).toEqual([]);
    expect((await req("POST", "/v1/listings", { ...gpuListing, partName: "GTX 1660 Super", machinePartId: replaced[0].id }, token)).statusCode).toBe(409);

    await req("PATCH", `/v1/listings/${posted.json().item.id}`, { status: "sold" }, token);
    const mp = await t.db.selectFrom("machine_parts").select("status").where("id", "=", replaced[0].id).executeTakeFirstOrThrow();
    expect(mp.status).toBe("sold");
  });

  it("không đăng được linh kiện trong máy người khác", async () => {
    const other = (await t.db.selectFrom("machine_parts").select("id").limit(1).executeTakeFirstOrThrow()).id;
    expect((await req("POST", "/v1/listings", { ...gpuListing, machinePartId: other }, buyer)).statusCode).toBe(400);
  });
});
