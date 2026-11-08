import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unsafeSvg } from "../src/services/branding.js";
import { setup } from "./helpers.js";

let t: Awaited<ReturnType<typeof setup>>;
let admin: string, user: string;
const req = (method: string, url: string, payload?: unknown, token?: string, type?: string) =>
  t.app.inject({
    method: method as "GET", url, payload: payload as string,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(type ? { "content-type": type } : {}) },
  });
const register = async (email: string) =>
  (await req("POST", "/v1/auth/register", { email, password: "matkhau-dai-123", displayName: "Thử" })).json().token as string;
const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 166, b: 255, alpha: 1 } } }).png().toBuffer();
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 80" width="300" height="80"><rect width="300" height="80" fill="#1769FF"/></svg>`;

beforeAll(async () => {
  t = await setup();
  admin = await register("qt-brand@pcdex.invalid");
  await t.db.updateTable("users").set({ role: "admin" }).where("email", "=", "qt-brand@pcdex.invalid").execute();
  user = await register("thuong-brand@pcdex.invalid");
}, 60_000);
afterAll(async () => { await t.close(); });

describe("thương hiệu", () => {
  it("chưa đặt gì: mọi trường null (web dùng mặc định)", async () => {
    expect((await req("GET", "/v1/branding")).json()).toEqual({ siteName: null, slogan: null, description: null, logo: null, logoLight: null, favicon: null });
  });

  it("chỉ admin sửa được; lưu tên, slogan, mô tả", async () => {
    const body = { siteName: "pcdex", slogan: "Build it. Show it. Trade it.", description: "Mạng xã hội PC" };
    expect((await req("PUT", "/v1/admin/branding", body, user)).statusCode).toBe(403);
    expect((await req("PUT", "/v1/admin/branding", { ...body, siteName: "" }, admin)).statusCode).toBe(400);
    expect((await req("PUT", "/v1/admin/branding", body, admin)).json()).toMatchObject(body);
    expect((await req("GET", "/v1/branding")).json()).toMatchObject(body);
  });

  it("logo PNG đổi sang WebP; SVG sạch giữ nguyên, có CSP khi phục vụ", async () => {
    const r = await req("PUT", "/v1/admin/branding/logo", await png(900, 240), admin, "image/png");
    expect(r.statusCode).toBe(200);
    expect(r.json().logo).toMatchObject({ mime: "image/webp", width: 900, height: 240 });
    const s = await req("PUT", "/v1/admin/branding/logo_light", SVG, admin, "image/svg+xml");
    expect(s.json().logoLight).toMatchObject({ mime: "image/svg+xml", width: 300, height: 80 });
    const got = await req("GET", s.json().logoLight.url.replace("/api", ""));
    expect(got.headers["content-type"]).toBe("image/svg+xml");
    expect(got.headers["content-security-policy"]).toContain("sandbox");
    expect(got.headers["cache-control"]).toContain("immutable");
  });

  it("chặn SVG có script / liên kết ngoài, ảnh hỏng, logo dọc", async () => {
    expect(unsafeSvg(`<svg><script>alert(1)</script></svg>`)).toBeTruthy();
    expect(unsafeSvg(`<svg onload="x()"></svg>`)).toBeTruthy();
    expect(unsafeSvg(`<svg><image href="https://lua.dao/a.png"/></svg>`)).toBeTruthy();
    expect(unsafeSvg(SVG)).toBeNull();
    const bad = await req("PUT", "/v1/admin/branding/logo", `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>x</script></svg>`, admin, "image/svg+xml");
    expect(bad.statusCode).toBe(400);
    expect((await req("PUT", "/v1/admin/branding/logo", Buffer.from("khong phai anh"), admin, "image/png")).statusCode).toBe(400);
    expect((await req("PUT", "/v1/admin/branding/logo", await png(100, 400), admin, "image/png")).statusCode).toBe(400);
  });

  it("favicon: phải gần vuông; lưu PNG 512, phục vụ đủ cỡ", async () => {
    expect((await req("PUT", "/v1/admin/branding/favicon", await png(512, 200), admin, "image/png")).statusCode).toBe(400);
    const r = await req("PUT", "/v1/admin/branding/favicon", await png(256, 256), admin, "image/png");
    expect(r.json().favicon).toMatchObject({ mime: "image/png", width: 512, height: 512 });
    const small = await req("GET", "/v1/branding/asset/favicon?s=32");
    expect((await sharp(small.rawPayload).metadata()).width).toBe(32);
    const apple = await req("GET", "/v1/branding/asset/favicon?s=180");
    expect((await sharp(apple.rawPayload).metadata()).width).toBe(180);
  });

  it("khôi phục mặc định: xóa ảnh", async () => {
    expect((await req("DELETE", "/v1/admin/branding/favicon", undefined, admin)).json().favicon).toBeNull();
    expect((await req("GET", "/v1/branding/asset/favicon")).statusCode).toBe(404);
  });
});
