import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { translateMessage } from "../src/i18n.js";
import type { Outgoing } from "../src/services/email.js";
import { setup } from "./helpers.js";

const outbox: Outgoing[] = [];
let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup({ sendMail: async (m) => { outbox.push(m); } }); }, 60_000);
afterAll(async () => { await t.close(); });

const req = (method: string, url: string, payload?: unknown, opts: { token?: string; lang?: string } = {}) =>
  t.app.inject({
    method: method as "GET", url, payload: payload as object,
    headers: { ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...(opts.lang ? { "x-lang": opts.lang } : {}) },
  });
const mailTo = async (to: string) => {
  let m: Outgoing | undefined;
  await vi.waitFor(() => { m = outbox.find((x) => x.to === to); expect(m).toBeTruthy(); });
  return m!;
};

describe("thông báo lỗi theo ngôn ngữ", () => {
  it("x-lang: en → câu tiếng Anh; không có → tiếng Việt", async () => {
    const vi1 = await req("POST", "/v1/auth/login", { email: "khong@pcdex.invalid", password: "sai-mat-khau-1" });
    expect(vi1.json().message).toBe("Email hoặc mật khẩu chưa đúng.");
    const en1 = await req("POST", "/v1/auth/login", { email: "khong@pcdex.invalid", password: "sai-mat-khau-1" }, { lang: "en" });
    expect(en1.json().message).toBe("Wrong email or password.");
    expect((await req("GET", "/v1/me", undefined, { lang: "en" })).json().message).toBe("You need to sign in.");
  });

  it("câu có số liệu", () => {
    expect(translateMessage("Mật khẩu từ 8 ký tự", "en")).toBe("Password needs at least 8 characters");
    expect(translateMessage("Đăng nhập sai nhiều lần. Thử lại sau 3 phút.", "en")).toBe("Too many failed sign-ins. Try again in 3 minutes.");
    expect(translateMessage("Tài khoản đã bị khóa: Spam. Liên hệ lienhe@pcdex.app nếu cần.", "en")).toBe("This account is locked: Spam. Contact lienhe@pcdex.app if needed.");
  });

  it("mọi thông báo người dùng thấy đều có bản tiếng Anh (trừ trang quản trị)", async () => {
    const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
    const files = [
      ...(await readdir(path.join(SRC, "routes"))).map((f) => `routes/${f}`),
      ...(await readdir(path.join(SRC, "services"))).map((f) => `services/${f}`),
    ].filter((f) => !/admin|branding|settings|email\.ts/.test(f));
    const missing: string[] = [];
    for (const f of files) {
      const s = await readFile(path.join(SRC, f), "utf8");
      // câu cố định trong message: "…" / Error(…, "…") có chữ tiếng Việt
      for (const m of s.matchAll(/(?:message:\s*|Error\((?:\d+,\s*)?|AuthError\("[a-z_]+",\s*)"([^"]*[À-ỹđĐ][^"]*)"/g))
        if (translateMessage(m[1]!, "en") === m[1]) missing.push(`${f}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });
});

describe("ngôn ngữ của tài khoản và email", () => {
  it("đăng ký ở trang tiếng Anh: tài khoản tiếng Anh, thư chào mừng tiếng Anh có link /en/", async () => {
    const r = await req("POST", "/v1/auth/register", { email: "en-user@pcdex.invalid", password: "matkhau-dai-123", displayName: "Alex" }, { lang: "en" });
    expect(r.json().user.locale).toBe("en");
    const m = await mailTo("en-user@pcdex.invalid");
    expect(m.subject).toBe("Welcome to pcdex, Alex");
    expect(m.text).toMatch(/https:\/\/pcdex\.test\/en\/xac-minh-email\?t=/);
    expect(m.text).toContain("https://pcdex.test/en/may");
  });

  it("đổi ngôn ngữ trong tài khoản → thư sau đó theo ngôn ngữ mới", async () => {
    const token = (await req("POST", "/v1/auth/register", { email: "doi@pcdex.invalid", password: "matkhau-dai-123", displayName: "Bình" })).json().token as string;
    expect((await mailTo("doi@pcdex.invalid")).subject).toBe("Chào mừng Bình đến với pcdex");
    expect((await req("PATCH", "/v1/me", { locale: "en" }, { token })).json().user.locale).toBe("en");
    await t.db.updateTable("email_tokens").set({ created_at: new Date(Date.now() - 120_000) }).execute();
    outbox.length = 0;
    await req("POST", "/v1/me/verify-email", {}, { token });
    const m = await mailTo("doi@pcdex.invalid");
    expect(m.subject).toBe("Verify your email for pcdex");
    expect(m.text).toContain("/en/xac-minh-email?t=");
  });

  it("quản trị sửa mẫu tiếng Anh riêng, không ảnh hưởng bản tiếng Việt", async () => {
    const admin = (await req("POST", "/v1/auth/register", { email: "qt-i18n@pcdex.invalid", password: "matkhau-dai-123", displayName: "QT" })).json().token as string;
    await t.db.updateTable("users").set({ role: "admin" }).where("email", "=", "qt-i18n@pcdex.invalid").execute();
    const en = (await req("GET", "/v1/admin/email/templates?lang=en", undefined, { token: admin })).json();
    expect(en.lang).toBe("en");
    expect(en.templates[0].subject).toBe("Welcome to pcdex, {{ten}}");
    await req("PUT", "/v1/admin/email/templates/welcome?lang=en", { subject: "Hey {{ten}}", body: "Hi.", enabled: true }, { token: admin });
    expect((await req("GET", "/v1/admin/email/templates?lang=en", undefined, { token: admin })).json().templates[0].subject).toBe("Hey {{ten}}");
    expect((await req("GET", "/v1/admin/email/templates", undefined, { token: admin })).json().templates[0].subject).toBe("Chào mừng {{ten}} đến với pcdex");
  });
});
