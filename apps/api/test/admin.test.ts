import { createServer, type Server } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "../src/services/settings.js";
import { ageParts, setup, spec } from "./helpers.js";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup({ settingsKey: "khoa-thu-nghiem" }); }, 60_000);
afterAll(async () => { await t.close(); });

const req = (method: string, url: string, payload?: unknown, token?: string) =>
  t.app.inject({ method: method as "GET", url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
const register = async (email: string) =>
  (await req("POST", "/v1/auth/register", { email, password: "matkhau-dai-123", displayName: email.split("@")[0] })).json().token as string;
const login = (email: string) => req("POST", "/v1/auth/login", { email, password: "matkhau-dai-123" });
const idOf = async (email: string) => (await t.db.selectFrom("users").select("id").where("email", "=", email).executeTakeFirstOrThrow()).id;

let admin: string, user: string, userId: string;
beforeAll(async () => {
  admin = await register("admin@test.vn");
  await t.db.updateTable("users").set({ role: "admin" }).where("email", "=", "admin@test.vn").execute();
  user = await register("nguoiban@test.vn");
  userId = await idOf("nguoiban@test.vn");
  await req("POST", "/v1/me/machines", { spec: spec() }, user);
});

describe("quyền vào trang quản trị", () => {
  it("khách 401, người dùng thường 403, admin 200; hồ sơ có vai trò", async () => {
    expect((await req("GET", "/v1/admin/stats")).statusCode).toBe(401);
    expect((await req("GET", "/v1/admin/stats", undefined, user)).statusCode).toBe(403);
    const s = await req("GET", "/v1/admin/stats", undefined, admin);
    expect(s.statusCode).toBe(200);
    expect(s.json().stats.users).toBeGreaterThanOrEqual(2);
    expect((await req("GET", "/v1/me", undefined, admin)).json().user.role).toBe("admin");
  });

  it("tìm người dùng theo tên tài khoản / email", async () => {
    const r = (await req("GET", "/v1/admin/users?q=nguoiban", undefined, admin)).json().items;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ email: "nguoiban@test.vn", machines: 1, role: "user", providers: ["password"] });
  });
});

describe("khóa tài khoản", () => {
  let listingId: string;
  beforeAll(async () => {
    const parts = (await req("GET", "/v1/me/listings", undefined, user)).json().parts as { id: string; kind: string }[];
    const r = await req("POST", "/v1/listings", { machinePartId: parts.find((p) => p.kind === "gpu")!.id, priceVnd: 4_000_000, condition: "used", warrantyMonths: 0, province: "Hà Nội", contact: "0912345678", durationDays: 7 }, user);
    listingId = r.json().item.id;
  });

  it("khóa: mất phiên, không đăng nhập được, tin bị ẩn, ra khỏi bảng xếp hạng", async () => {
    expect((await req("GET", "/v1/leaderboard")).json().items.some((i: { userId: string }) => i.userId === userId)).toBe(true);
    expect((await req("PATCH", `/v1/admin/users/${userId}`, { banned: true, reason: "Lừa đảo" }, admin)).statusCode).toBe(200);
    expect((await req("GET", "/v1/me", undefined, user)).statusCode).toBe(401);
    const l = await login("nguoiban@test.vn");
    expect(l.statusCode).toBe(403);
    expect(l.json().message).toMatch(/Lừa đảo/);
    expect((await req("GET", "/v1/listings")).json().items.some((i: { id: string }) => i.id === listingId)).toBe(false);
    expect((await req("GET", "/v1/leaderboard")).json().items.some((i: { userId: string }) => i.userId === userId)).toBe(false);
    expect((await req("GET", "/v1/admin/users?filter=banned", undefined, admin)).json().items[0]).toMatchObject({ banReason: "Lừa đảo" });
  });

  it("mở khóa: đăng nhập lại được", async () => {
    await req("PATCH", `/v1/admin/users/${userId}`, { banned: false }, admin);
    const l = await login("nguoiban@test.vn");
    expect(l.statusCode).toBe(200);
    user = l.json().token;
  });

  it("không tự khóa / tự hạ quyền mình; cấp quyền admin cho người khác", async () => {
    const me = await idOf("admin@test.vn");
    expect((await req("PATCH", `/v1/admin/users/${me}`, { banned: true }, admin)).statusCode).toBe(400);
    expect((await req("PATCH", `/v1/admin/users/${me}`, { role: "user" }, admin)).statusCode).toBe(400);
    expect((await req("PATCH", `/v1/admin/users/${userId}`, { role: "admin" }, admin)).statusCode).toBe(200);
    expect((await req("GET", "/v1/admin/stats", undefined, user)).statusCode).toBe(200);
    // khóa / xóa quản trị viên khác: phải bỏ quyền trước
    expect((await req("PATCH", `/v1/admin/users/${userId}`, { banned: true }, admin)).statusCode).toBe(400);
    expect((await req("DELETE", `/v1/admin/users/${userId}`, undefined, admin)).statusCode).toBe(400);
    await req("PATCH", `/v1/admin/users/${userId}`, { role: "user" }, admin);
    expect((await req("GET", "/v1/admin/stats", undefined, user)).statusCode).toBe(403);
  });
});

describe("gỡ tin vi phạm", () => {
  it("gỡ tin linh kiện đã thay ra: biến khỏi chợ, linh kiện về kho, người bán không tự mở lại; khôi phục; xóa", async () => {
    // thay card để có linh kiện "đã thay ra" rồi đăng bán nó
    await ageParts(t.db);
    const ms = (await req("GET", "/v1/me/machines", undefined, user)).json().machines;
    await req("PUT", `/v1/me/machines/${ms[0].id}`, { spec: spec({ gpu: "RTX 4070" }) }, user);
    const parts = (await req("GET", "/v1/me/listings", undefined, user)).json().parts as { id: string; label: string; inUse: boolean }[];
    const old = parts.find((p) => p.label === "RTX 3060 12GB" && !p.inUse)!;
    const id = (await req("POST", "/v1/listings", { machinePartId: old.id, priceVnd: 3_500_000, condition: "used", warrantyMonths: 0, province: "Hà Nội", contact: "0912345678", durationDays: 7 }, user)).json().item.id;
    const partStatus = async () => (await t.db.selectFrom("machine_parts").select("status").where("id", "=", old.id).executeTakeFirstOrThrow()).status;
    expect(await partStatus()).toBe("for_sale");

    expect((await req("PATCH", `/v1/admin/listings/${id}`, { removed: true, reason: "Ảnh không phải hàng thật" }, admin)).statusCode).toBe(200);
    expect((await req("GET", "/v1/listings")).json().items.some((i: { id: string }) => i.id === id)).toBe(false);
    expect((await req("GET", `/v1/listings/${id}`)).statusCode).toBe(404);
    expect(await partStatus()).toBe("replaced");
    const reopen = await req("PATCH", `/v1/listings/${id}`, { status: "active" }, user);
    expect(reopen.statusCode).toBe(403);
    expect(reopen.json().message).toMatch(/Ảnh không phải hàng thật/);
    expect((await req("GET", "/v1/admin/listings?status=removed", undefined, admin)).json().items.map((i: { id: string }) => i.id)).toContain(id);

    await req("PATCH", `/v1/admin/listings/${id}`, { removed: false }, admin);
    expect((await req("PATCH", `/v1/listings/${id}`, { status: "active" }, user)).statusCode).toBe(200);
    expect((await req("DELETE", `/v1/admin/listings/${id}`, undefined, admin)).statusCode).toBe(200);
    expect(await partStatus()).toBe("replaced");
    const log = (await req("GET", "/v1/admin/stats", undefined, admin)).json().log.map((l: { action: string }) => l.action);
    expect(log).toEqual(expect.arrayContaining(["listing.remove", "listing.restore", "listing.delete", "user.ban", "user.unban", "user.role"]));
  });
});

describe("cấu hình email (SMTP)", () => {
  it("mã hóa / giải mã mật khẩu", () => {
    const box = encrypt("k", "mat-khau-smtp");
    expect(box).not.toContain("mat-khau-smtp");
    expect(decrypt("k", box)).toBe("mat-khau-smtp");
    expect(() => decrypt("khoa-khac", box)).toThrow();
  });

  // máy chủ SMTP giả (không mã hóa) để thử gửi thật
  let server: Server, port = 0;
  const received: string[] = [];
  beforeAll(async () => {
    server = createServer((sock) => {
      let data = false, buf = "";
      sock.write("220 test ESMTP\r\n");
      sock.on("data", (chunk) => {
        buf += chunk.toString();
        let i: number;
        while ((i = buf.indexOf("\r\n")) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 2);
          if (data) { if (line === ".") { data = false; sock.write("250 OK queued\r\n"); } else received.push(line); continue; }
          const cmd = line.slice(0, 4).toUpperCase();
          if (cmd === "EHLO" || cmd === "HELO") sock.write("250-test\r\n250 AUTH PLAIN LOGIN\r\n");
          else if (cmd === "AUTH") sock.write("235 OK\r\n");
          else if (cmd === "DATA") { data = true; sock.write("354 go\r\n"); }
          else if (cmd === "QUIT") { sock.write("221 bye\r\n"); sock.end(); }
          else sock.write("250 OK\r\n");
        }
      });
    });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    port = (server.address() as { port: number }).port;
  });
  afterAll(() => { server.close(); });

  it("lưu cấu hình, không lộ mật khẩu, gửi thư thử", async () => {
    expect((await req("GET", "/v1/admin/settings/smtp", undefined, admin)).json()).toEqual({ smtp: null, keyReady: true });
    expect((await req("POST", "/v1/admin/settings/smtp/test", { to: "a@test.vn" }, admin)).statusCode).toBe(409);
    const cfg = { host: "127.0.0.1", port, security: "none", user: "pcdex", password: "bi-mat-123", fromName: "pcdex", fromEmail: "no-reply@pcdex.app", enabled: true };
    const s = await req("PUT", "/v1/admin/settings/smtp", cfg, admin);
    expect(s.statusCode).toBe(200);
    expect(JSON.stringify(s.json())).not.toContain("bi-mat-123");
    expect(s.json().smtp).toMatchObject({ host: "127.0.0.1", hasPassword: true });
    const row = await t.db.selectFrom("app_settings").select("value").where("key", "=", "smtp").executeTakeFirstOrThrow();
    expect(JSON.stringify(row.value)).not.toContain("bi-mat-123");
    // lưu lại không gửi mật khẩu → giữ mật khẩu cũ
    expect((await req("PUT", "/v1/admin/settings/smtp", { ...cfg, password: undefined, fromName: "pcdex.app" }, admin)).json().smtp.hasPassword).toBe(true);
    const r = await req("POST", "/v1/admin/settings/smtp/test", { to: "nhan@test.vn" }, admin);
    expect(r.statusCode).toBe(200);
    expect(r.json().accepted).toEqual(["nhan@test.vn"]);
    expect(received.join("\n")).toMatch(/^Subject: /m);
    expect(received.join("\n")).toContain('From: "pcdex.app" <no-reply@pcdex.app>');
    expect((await req("PUT", "/v1/admin/settings/smtp", cfg, user)).statusCode).toBe(403);
  });
});
