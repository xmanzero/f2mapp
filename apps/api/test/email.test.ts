import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { deviceOf, renderHtml, renderSubject, renderText, type Outgoing } from "../src/services/email.js";
import { setup } from "./helpers.js";

const outbox: Outgoing[] = [];
let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup({ sendMail: async (m) => { outbox.push(m); } }); }, 60_000);
afterAll(async () => { await t.close(); });

const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const req = (method: string, url: string, payload?: unknown, token?: string, ua = WIN) =>
  t.app.inject({ method: method as "GET", url, payload: payload as object, headers: { "user-agent": ua, ...(token ? { authorization: `Bearer ${token}` } : {}) } });
const PW = "matkhau-dai-123";
const register = async (email: string, name = "Minh Anh") => (await req("POST", "/v1/auth/register", { email, password: PW, displayName: name })).json().token as string;
/** đợi thư gửi nền tới hộp thư giả */
const mailTo = async (to: string, subject: RegExp) => {
  let m: Outgoing | undefined;
  await vi.waitFor(() => { m = outbox.find((x) => x.to === to && subject.test(x.subject)); expect(m).toBeTruthy(); });
  return m!;
};
const linkIn = (m: Outgoing, path: string) => new RegExp(`https://pcdex\\.test${path}\\?t=([\\w-]+)`).exec(m.text)?.[1];

describe("dựng thư từ mẫu", () => {
  it("chèn biến, khối điều kiện, nút và liên kết", () => {
    const body = "Chào {{ten}},\n\n{{#link}}Có link.\n\n[Bấm]({{link}})\n{{/link}}Hết **đậm**.";
    const html = renderHtml(body, { ten: "An", link: "https://pcdex.app/x?a=1&b=2" });
    expect(html).toContain("Chào An,");
    expect(html).toMatch(/<a href="https:\/\/pcdex\.app\/x\?a=1&amp;b=2" style="display:inline-block[^>]*>Bấm<\/a>/);
    expect(html).toContain("<b>đậm</b>");
    const noLink = renderText(body, { ten: "An", link: "" });
    expect(noLink).toBe("Chào An,\n\nHết đậm.");
    expect(renderText(body, { ten: "An", link: "https://x.vn" })).toContain("Bấm: https://x.vn");
    expect(renderSubject("Chào {{ten}}\n", { ten: "An" })).toBe("Chào An");
  });

  it("giá trị biến không thành cú pháp hay HTML", () => {
    const html = renderHtml("Chào {{ten}}", { ten: "<script>x</script> [bấm](https://lua.dao)" });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="https://lua.dao"');
    // link không phải http(s) bị bỏ
    expect(renderHtml("[x](javascript:alert(1))", {})).not.toContain("javascript");
  });

  it("nhận ra thiết bị", () => {
    expect(deviceOf(WIN)).toBe("Chrome trên Windows");
    expect(deviceOf(IPHONE)).toBe("Safari trên iOS");
    expect(deviceOf(undefined)).toBe("Thiết bị không rõ");
  });
});

describe("tạo tài khoản và xác minh email", () => {
  it("đăng ký: thư chào mừng có link xác minh; bấm link thì email được xác minh, dùng lại thì hỏng", async () => {
    const token = await register("moi@test.vn");
    const m = await mailTo("moi@test.vn", /Chào mừng Minh Anh/);
    expect(m.html).toContain("Xác minh email");
    const v = linkIn(m, "/xac-minh-email")!;
    expect(v).toBeTruthy();
    expect((await req("GET", "/v1/me", undefined, token)).json().user.emailVerified).toBe(false);
    expect((await req("POST", "/v1/auth/verify-email", { token: v })).json()).toEqual({ ok: true, email: "moi@test.vn" });
    expect((await req("GET", "/v1/me", undefined, token)).json().user.emailVerified).toBe(true);
    expect((await req("POST", "/v1/auth/verify-email", { token: v })).statusCode).toBe(400);
    expect((await req("POST", "/v1/me/verify-email", {}, token)).statusCode).toBe(409);
  });

  it("gửi lại thư xác minh: link cũ hết giá trị, chặn gửi dồn", async () => {
    const token = await register("guilai@test.vn");
    const first = linkIn(await mailTo("guilai@test.vn", /Chào mừng/), "/xac-minh-email")!;
    // vừa gửi thư chào mừng (có mã) → phải chờ 1 phút
    expect((await req("POST", "/v1/me/verify-email", {}, token)).statusCode).toBe(429);
    await t.db.updateTable("email_tokens").set({ created_at: new Date(Date.now() - 120_000) }).execute();
    expect((await req("POST", "/v1/me/verify-email", {}, token)).json()).toEqual({ ok: true, email: "guilai@test.vn" });
    const second = linkIn(await mailTo("guilai@test.vn", /Xác minh email/), "/xac-minh-email")!;
    expect((await req("POST", "/v1/auth/verify-email", { token: first })).statusCode).toBe(400);
    expect((await req("POST", "/v1/auth/verify-email", { token: second })).statusCode).toBe(200);
  });

  it("đăng ký bằng Google: thư chào mừng không có link xác minh", async () => {
    const idToken = await t.googleToken({ sub: "g-email-1", email: "gg@test.vn", email_verified: true, name: "Gờ Gờ" });
    expect((await req("POST", "/v1/auth/google", { idToken })).statusCode).toBe(201);
    const m = await mailTo("gg@test.vn", /Chào mừng Gờ Gờ/);
    expect(m.text).not.toContain("xac-minh-email");
  });
});

describe("quên mật khẩu", () => {
  it("email không có tài khoản: cùng câu trả lời, không gửi thư", async () => {
    const n = outbox.length;
    const r = await req("POST", "/v1/auth/forgot", { email: "khongco@test.vn" });
    expect(r.statusCode).toBe(200);
    await new Promise((ok) => setTimeout(ok, 50));
    expect(outbox.length).toBe(n);
  });

  it("đặt lại bằng link: đăng nhập luôn, phiên cũ bị đăng xuất, mật khẩu mới dùng được, link chỉ dùng một lần", async () => {
    const old = await register("quen@test.vn");
    await req("POST", "/v1/auth/forgot", { email: "QUEN@test.vn" });
    const m = await mailTo("quen@test.vn", /Đặt lại mật khẩu/);
    expect(m.text).toMatch(/IP /);
    const k = linkIn(m, "/dat-lai-mat-khau")!;
    expect((await req("POST", "/v1/auth/reset", { token: k, password: "ngan" })).statusCode).toBe(400);
    const r = await req("POST", "/v1/auth/reset", { token: k, password: "mat-khau-moi-456" });
    expect(r.statusCode).toBe(200);
    expect(r.json().user.emailVerified).toBe(true);
    expect((await req("GET", "/v1/me", undefined, old)).statusCode).toBe(401);
    expect((await req("POST", "/v1/auth/login", { email: "quen@test.vn", password: "mat-khau-moi-456" })).statusCode).toBe(200);
    expect((await req("POST", "/v1/auth/reset", { token: k, password: "mat-khau-khac-789" })).statusCode).toBe(400);
    await mailTo("quen@test.vn", /vừa được đổi/);
  });

  it("chặn gửi dồn: yêu cầu thứ hai trong 1 phút không tạo thư mới", async () => {
    await register("don@test.vn");
    await req("POST", "/v1/auth/forgot", { email: "don@test.vn" });
    await mailTo("don@test.vn", /Đặt lại/);
    await req("POST", "/v1/auth/forgot", { email: "don@test.vn" });
    await new Promise((ok) => setTimeout(ok, 50));
    expect(outbox.filter((m) => m.to === "don@test.vn" && /Đặt lại/.test(m.subject))).toHaveLength(1);
  });
});

describe("đăng nhập từ thiết bị mới", () => {
  it("báo khi đăng nhập từ thiết bị chưa gặp, không báo lại thiết bị cũ", async () => {
    await register("thietbi@test.vn");
    const count = () => outbox.filter((m) => m.to === "thietbi@test.vn" && /thiết bị mới/.test(m.subject)).length;
    await req("POST", "/v1/auth/login", { email: "thietbi@test.vn", password: PW });
    await new Promise((ok) => setTimeout(ok, 50));
    expect(count()).toBe(0);
    await req("POST", "/v1/auth/login", { email: "thietbi@test.vn", password: PW }, undefined, IPHONE);
    const m = await mailTo("thietbi@test.vn", /thiết bị mới/);
    expect(m.text).toContain("Safari trên iOS");
    await req("POST", "/v1/auth/login", { email: "thietbi@test.vn", password: PW }, undefined, IPHONE);
    await new Promise((ok) => setTimeout(ok, 50));
    expect(count()).toBe(1);
  });
});

describe("quản lý mẫu thư", () => {
  let admin: string;
  beforeAll(async () => {
    admin = await register("qt-email@test.vn", "Quản trị");
    await t.db.updateTable("users").set({ role: "admin" }).where("email", "=", "qt-email@test.vn").execute();
  });

  it("chỉ admin; danh sách đủ mẫu với biến", async () => {
    const user = await register("thuong@test.vn");
    expect((await req("GET", "/v1/admin/email/templates", undefined, user)).statusCode).toBe(403);
    const r = (await req("GET", "/v1/admin/email/templates", undefined, admin)).json();
    expect(r.templates.map((x: { key: string }) => x.key)).toEqual(
      ["welcome", "verify_email", "password_reset", "password_changed", "new_login", "account_banned", "listing_removed"]);
    expect(r.templates[0].vars.map((v: { name: string }) => v.name)).toContain("link_xac_minh");
  });

  it("sửa mẫu được dùng khi gửi; tắt mẫu thì bỏ qua và ghi nhật ký; khôi phục mặc định", async () => {
    const bad = await req("PUT", "/v1/admin/email/templates/welcome", { subject: "Xin chào {{ho_ten}}", body: "x", enabled: true }, admin);
    expect(bad.statusCode).toBe(400);
    expect(bad.json().message).toContain("{{ho_ten}}");
    expect((await req("PUT", "/v1/admin/email/templates/welcome", { subject: "Hello {{ten}}", body: "Chào {{ten}}.", enabled: true }, admin)).statusCode).toBe(200);
    await register("mau@test.vn", "Bình");
    expect((await mailTo("mau@test.vn", /^Hello Bình$/)).text).toBe("Chào Bình.");

    await req("PUT", "/v1/admin/email/templates/welcome", { subject: "Hello {{ten}}", body: "Chào {{ten}}.", enabled: false }, admin);
    await register("tat@test.vn");
    await vi.waitFor(async () => {
      const log = (await req("GET", "/v1/admin/email/log?template=welcome&status=skipped", undefined, admin)).json().items;
      expect(log.some((l: { to_email: string; error: string }) => l.to_email === "tat@test.vn" && l.error === "Mẫu đang tắt")).toBe(true);
    });
    expect(outbox.some((m) => m.to === "tat@test.vn")).toBe(false);

    const reset = (await req("DELETE", "/v1/admin/email/templates/welcome", undefined, admin)).json();
    expect(reset.templates[0]).toMatchObject({ customized: false, enabled: true, subject: "Chào mừng {{ten}} đến với pcdex" });
  });

  it("xem trước và gửi thử bản đang soạn", async () => {
    const p = (await req("POST", "/v1/admin/email/templates/password_reset/preview", { subject: "Đặt lại cho {{ten}}", body: "[Đặt lại]({{link}})" }, admin)).json();
    expect(p.subject).toBe("Đặt lại cho Minh Anh");
    expect(p.html).toContain("Đặt lại</a>");
    expect((await req("POST", "/v1/admin/email/templates/password_reset/test", { subject: "S {{ten}}", body: "B", to: "nhan@test.vn" }, admin)).json()).toEqual({ ok: true });
    expect(outbox.find((m) => m.to === "nhan@test.vn")?.subject).toBe("[Thử] S Minh Anh");
  });

  it("khóa tài khoản và gỡ tin gửi thư cho người dùng", async () => {
    await register("bikhoa@test.vn");
    const id = (await t.db.selectFrom("users").select("id").where("email", "=", "bikhoa@test.vn").executeTakeFirstOrThrow()).id;
    await req("PATCH", `/v1/admin/users/${id}`, { banned: true, reason: "Spam" }, admin);
    expect((await mailTo("bikhoa@test.vn", /bị khóa/)).text).toContain("Lý do: Spam.");
  });
});
