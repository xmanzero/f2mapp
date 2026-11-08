import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { processPhoto } from "../src/services/photos.js";
import { setup, spec } from "./helpers.js";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); }, 60_000);
afterAll(async () => { await t.close(); });

const req = (method: string, url: string, payload?: unknown, token?: string, type?: string) =>
  t.app.inject({
    method: method as "GET", url, payload: payload as object,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(type ? { "content-type": type } : {}) },
  });
const register = async (email: string) =>
  (await req("POST", "/v1/auth/register", { email, password: "matkhau-dai-123", displayName: email.split("@")[0] })).json().token as string;

// ảnh thật tạo bằng sharp; JPEG có EXIF (bản quyền "GPSTEST") để kiểm tra metadata bị bỏ
let jpeg: Buffer, png: Buffer;
beforeAll(async () => {
  jpeg = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: "#808080" } })
    .withExif({ IFD0: { Copyright: "GPSTEST" } }).jpeg().toBuffer();
  png = await sharp({ create: { width: 640, height: 480, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 0.5 } } }).png().toBuffer();
});

describe("ảnh tin rao", () => {
  let seller: string, other: string, listingId: string;
  beforeAll(async () => {
    seller = await register("anh@test.vn");
    other = await register("khac@test.vn");
    await req("POST", "/v1/me/machines", { spec: spec() }, seller);
    const gpu = (await req("GET", "/v1/me/listings", undefined, seller)).json().parts.find((p: { kind: string }) => p.kind === "gpu");
    listingId = (await req("POST", "/v1/listings", { machinePartId: gpu.id, priceVnd: 4_000_000, condition: "used", contact: "0912345678" }, seller)).json().item.id;
  });

  it("đổi sang WebP, thu về cạnh dài 1600 px, đóng dấu, bỏ metadata", async () => {
    expect(jpeg.includes(Buffer.from("GPSTEST"))).toBe(true);
    const out = await processPhoto(jpeg);
    const meta = await sharp(out).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 1600, height: 1200 });
    expect(meta.exif).toBeUndefined();
    expect(out.includes(Buffer.from("GPSTEST"))).toBe(false);
    // góc dưới phải có dấu (sáng hơn nền xám), góc trên trái giữ nguyên
    // stats() đọc ảnh đầu vào nên phải cắt ra buffer trước
    const region = async (left: number, top: number) =>
      (await sharp(await sharp(out).extract({ left, top, width: 160, height: 90 }).toBuffer()).stats()).channels[0]!;
    const corner = await region(1600 - 160, 1200 - 90);
    expect(corner.max).toBeGreaterThan(200); // chữ trắng
    expect(corner.min).toBeLessThan(100); // viên nền tối
    expect((await region(0, 0)).stdev).toBeLessThan(3); // góc khác giữ nguyên
    expect(out.length).toBeLessThan(jpeg.length);
  });

  it("đăng ảnh: chỉ chủ tin; kiểm định dạng theo nội dung; tối đa 5 ảnh; ảnh đầu là ảnh bìa", async () => {
    const url = `/v1/listings/${listingId}/photos`;
    expect((await req("POST", url, jpeg, undefined, "image/jpeg")).statusCode).toBe(401);
    expect((await req("POST", url, jpeg, other, "image/jpeg")).statusCode).toBe(403);
    expect((await req("POST", url, Buffer.from("<svg/>xxxxxxxxxxxx"), seller, "image/png")).statusCode).toBe(415);
    const first = await req("POST", url, jpeg, seller, "image/jpeg");
    expect(first.statusCode).toBe(201);
    for (let i = 0; i < 4; i++) expect((await req("POST", url, png, seller, "image/png")).statusCode).toBe(201);
    expect((await req("POST", url, png, seller, "image/png")).statusCode).toBe(409);

    const item = (await req("GET", `/v1/listings/${listingId}`)).json().item;
    expect(item.photos).toHaveLength(5);
    expect(item.photos[0]).toBe(first.json().id);
    // trên chợ cũng có danh sách ảnh
    expect((await req("GET", "/v1/listings")).json().items.find((x: { id: string }) => x.id === listingId).photos).toHaveLength(5);

    const img = await req("GET", `/v1/photos/${first.json().id}`);
    expect(img.statusCode).toBe(200);
    expect(img.headers["content-type"]).toBe("image/webp");
    expect(img.rawPayload.includes(Buffer.from("GPSTEST"))).toBe(false);
  });

  it("đổi ảnh bìa, xóa ảnh", async () => {
    const ids: string[] = (await req("GET", `/v1/listings/${listingId}`)).json().item.photos;
    const order = [ids[2]!, ...ids.filter((x) => x !== ids[2])];
    expect((await req("PUT", `/v1/listings/${listingId}/photos`, { order }, seller)).json().item.photos).toEqual(order);
    expect((await req("PUT", `/v1/listings/${listingId}/photos`, { order: order.slice(1) }, seller)).statusCode).toBe(400);
    expect((await req("DELETE", `/v1/listings/${listingId}/photos/${ids[0]}`, undefined, other)).statusCode).toBe(403);
    const after = (await req("DELETE", `/v1/listings/${listingId}/photos/${ids[0]}`, undefined, seller)).json().item.photos;
    expect(after).toHaveLength(4);
    expect((await req("GET", `/v1/photos/${ids[0]}`)).statusCode).toBe(404);
  });
});
