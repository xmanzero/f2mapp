import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stripJpegMeta } from "../src/services/photos.js";
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

// JPEG nhỏ nhất: SOI + APP1 (EXIF giả, có "GPS") + DQT giả + SOS + dữ liệu + EOI
const exif = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x0a]), Buffer.from("Exif\0GPS!")]).subarray(0, 12);
const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8]), exif,
  Buffer.from([0xff, 0xdb, 0x00, 0x04, 0x01, 0x02]),
  Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9]),
]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("ảnh tin rao", () => {
  let seller: string, other: string, listingId: string;
  beforeAll(async () => {
    seller = await register("anh@test.vn");
    other = await register("khac@test.vn");
    await req("POST", "/v1/me/machines", { spec: spec() }, seller);
    const gpu = (await req("GET", "/v1/me/listings", undefined, seller)).json().parts.find((p: { kind: string }) => p.kind === "gpu");
    listingId = (await req("POST", "/v1/listings", { machinePartId: gpu.id, priceVnd: 4_000_000, condition: "used", contact: "0912345678" }, seller)).json().item.id;
  });

  it("bỏ EXIF của JPEG, giữ phần ảnh", () => {
    const out = stripJpegMeta(jpeg);
    expect(out.includes(Buffer.from("GPS"))).toBe(false);
    expect(out.subarray(-3)).toEqual(Buffer.from([0x33, 0xff, 0xd9]));
    expect(out.length).toBe(jpeg.length - exif.length);
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
    expect(img.headers["content-type"]).toBe("image/jpeg");
    expect(img.rawPayload.includes(Buffer.from("GPS"))).toBe(false);
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
