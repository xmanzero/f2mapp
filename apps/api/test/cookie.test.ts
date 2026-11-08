import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setup } from "./helpers.js";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup({ cookieSecure: "auto" }); }, 60_000);
afterAll(async () => { await t.close(); });

const login = (headers: Record<string, string>) => t.app.inject({
  method: "POST", url: "/v1/auth/login", headers, payload: { email: "cookie@test.vn", password: "matkhau-dai-123" },
});

describe("cookie phiên: tự bật Secure khi vào bằng HTTPS", () => {
  beforeAll(async () => {
    await t.app.inject({ method: "POST", url: "/v1/auth/register", payload: { email: "cookie@test.vn", password: "matkhau-dai-123", displayName: "Cookie" } });
  });
  it("qua Cloudflare (CF-Visitor https) → Secure", async () => {
    const r = await login({ "cf-visitor": '{"scheme":"https"}', "x-forwarded-proto": "http" });
    expect(String(r.headers["set-cookie"])).toMatch(/; Secure/);
  });
  it("X-Forwarded-Proto bắt đầu bằng https → Secure", async () => {
    expect(String((await login({ "x-forwarded-proto": "https,http" })).headers["set-cookie"])).toMatch(/; Secure/);
  });
  it("vào LAN bằng http → không Secure (đăng nhập vẫn dùng được)", async () => {
    const r = await login({});
    expect(r.statusCode).toBe(200);
    expect(String(r.headers["set-cookie"])).not.toMatch(/Secure/);
  });
});
