import { computeScores, resolveMachine, tierOf, type MachineInput } from "@f2m/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/password.js";
import { ageParts, setup } from "./helpers.js";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); }, 60_000);
afterAll(async () => { await t.close(); });

const machine = { cpu: "Core i5-12400F", gpu: "RTX 3060 12GB", ramGb: 16, ramChannels: 2, storage: "nvme3", pcieGen: 4, psuW: 550, resolution: 1080 };
const req = (method: string, url: string, payload?: unknown, token?: string) =>
  t.app.inject({ method: method as "GET", url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
const register = (email: string, password = "matkhau-dai-123", displayName = "Người chơi") =>
  req("POST", "/v1/auth/register", { email, password, displayName });
const login = (email: string, password: string) => req("POST", "/v1/auth/login", { email, password });

it("mật khẩu băm bằng scrypt, mỗi lần một muối", async () => {
  const a = await hashPassword("abc12345"), b = await hashPassword("abc12345");
  expect(a).not.toBe(b);
  expect(a.startsWith("scrypt$")).toBe(true);
  expect(await verifyPassword("abc12345", a)).toBe(true);
  expect(await verifyPassword("abc12346", a)).toBe(false);
});

describe("đăng ký bằng email", () => {
  it("tạo tài khoản + phiên, handle lấy từ email", async () => {
    const r = await register("Khoa.Nguyen@Gmail.com", "matkhau-dai-123", "Khoa");
    expect(r.statusCode).toBe(201);
    expect(r.headers["set-cookie"]).toContain("f2m_session=");
    expect(r.json().user).toMatchObject({ email: "khoa.nguyen@gmail.com", handle: "khoa.nguyen", hasPassword: true, providers: ["password"] });
  });
  it("email trùng (khác hoa thường) trả 409", async () => {
    expect((await register("KHOA.nguyen@gmail.com")).statusCode).toBe(409);
  });
  it("mật khẩu ngắn, email sai định dạng: 400 kèm lời giải thích", async () => {
    const short = await register("a1@gmail.com", "1234567");
    expect(short.statusCode).toBe(400);
    expect(short.json().message).toContain("8 ký tự");
    expect((await register("khong-phai-email", "matkhau-dai-123")).json().message).toContain("Email");
  });
});

describe("đăng nhập email + mật khẩu", () => {
  beforeAll(async () => { await register("login@test.vn", "dung-mat-khau"); });

  it("đúng thì vào; sai mật khẩu và email lạ cùng một thông báo", async () => {
    expect((await login("LOGIN@test.vn", "dung-mat-khau")).statusCode).toBe(200);
    const wrong = await login("login@test.vn", "sai-mat-khau");
    const unknown = await login("khong-co@test.vn", "sai-mat-khau");
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().message).toBe(unknown.json().message);
  });

  it("sai 5 lần thì khóa 15 phút, kể cả khi nhập đúng", async () => {
    await register("lock@test.vn", "dung-mat-khau");
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await login("lock@test.vn", "sai")).statusCode);
    expect(codes).toEqual([401, 401, 401, 401, 429]);
    const right = await login("lock@test.vn", "dung-mat-khau");
    expect(right.statusCode).toBe(429);
    expect(right.json().message).toContain("phút");
  });
});

describe("tài khoản và máy", () => {
  it("/v1/me cần đăng nhập", async () => {
    expect((await req("GET", "/v1/me")).statusCode).toBe(401);
  });

  it("lưu máy, tính điểm, thay card thì card cũ thành 'replaced', có tên trên bảng xếp hạng", async () => {
    const { token, user } = (await register("may@test.vn")).json();
    const r = await req("PUT", "/v1/me/machine", machine, token);
    expect(Math.round(r.json().scores.power)).toBe(10000);
    await ageParts(t.db);
    await req("PUT", "/v1/me/machine", { ...machine, gpu: "RTX 4070 Super" }, token);
    expect((await req("GET", "/v1/me/machine", undefined, token)).json().machine.gpu).toBe("RTX 4070 Super");
    const replaced = await t.db.selectFrom("machine_parts as mp").innerJoin("parts as p", "p.id", "mp.part_id")
      .select("p.name").where("mp.status", "=", "replaced").execute();
    expect(replaced.map((x) => x.name)).toContain("RTX 3060 12GB");
    const row = (await req("GET", "/v1/leaderboard")).json().items.find((x: { userId: string }) => x.userId === user.id);
    const expected = computeScores(resolveMachine({ ...machine, gpu: "RTX 4070 Super" } as MachineInput)).power;
    expect(row).toMatchObject({ gpu: "RTX 4070 Super", power: Math.round(expected), tier: tierOf(expected).code });
    // chi tiết máy xem công khai: không cần đăng nhập, có cấu hình đủ, không lộ id linh kiện
    const d = (await req("GET", `/v1/leaderboard/${user.id}`)).json();
    expect(d.spec).toMatchObject({ gpu: "RTX 4070 Super", cpu: machine.cpu });
    expect(d.parts.map((p: { kind: string }) => p.kind)).toEqual(expect.arrayContaining(["cpu", "gpu"]));
    expect(d.parts.every((p: Record<string, unknown>) => !("id" in p))).toBe(true);
    expect((await req("GET", "/v1/leaderboard/00000000-0000-0000-0000-000000000000")).statusCode).toBe(404);
    expect((await req("GET", "/v1/leaderboard/abc")).statusCode).toBe(404);
  });

  it("đổi tên tài khoản: trùng thì 409, sai định dạng thì 400", async () => {
    const a = (await register("ten1@test.vn")).json();
    const b = (await register("ten2@test.vn")).json();
    expect((await req("PATCH", "/v1/me", { handle: "khoa.pc", province: "Hà Nội" }, a.token)).json().user.handle).toBe("khoa.pc");
    expect((await req("PATCH", "/v1/me", { handle: "khoa.pc" }, b.token)).statusCode).toBe(409);
    expect((await req("PATCH", "/v1/me", { handle: "Có Dấu" }, b.token)).statusCode).toBe(400);
  });

  it("đổi mật khẩu: phải đúng mật khẩu cũ; xong thì thiết bị khác bị đăng xuất", async () => {
    const first = (await register("doimk@test.vn", "mat-khau-cu-1")).json();
    const other = (await login("doimk@test.vn", "mat-khau-cu-1")).json();
    expect((await req("POST", "/v1/me/password", { currentPassword: "sai", newPassword: "mat-khau-moi-2" }, first.token)).statusCode).toBe(400);
    expect((await req("POST", "/v1/me/password", { currentPassword: "mat-khau-cu-1", newPassword: "mat-khau-moi-2" }, first.token)).statusCode).toBe(200);
    expect((await req("GET", "/v1/me", undefined, first.token)).statusCode).toBe(200);
    expect((await req("GET", "/v1/me", undefined, other.token)).statusCode).toBe(401);
    expect((await login("doimk@test.vn", "mat-khau-moi-2")).statusCode).toBe(200);
  });

  it("đăng xuất thì token hết hiệu lực", async () => {
    const { token } = (await register("logout@test.vn")).json();
    expect((await req("POST", "/v1/auth/logout", {}, token)).statusCode).toBe(200);
    expect((await req("GET", "/v1/me", undefined, token)).statusCode).toBe(401);
  });
});

describe("đăng nhập Google", () => {
  it("tài khoản mới, handle lấy từ email", async () => {
    const idToken = await t.googleToken({ sub: "g-123", email: "minh.tran@gmail.com", email_verified: true, name: "Minh Trần" });
    const r = await req("POST", "/v1/auth/google", { idToken });
    expect(r.statusCode).toBe(201);
    expect(r.json().user).toMatchObject({ displayName: "Minh Trần", handle: "minh.tran", providers: ["google"], hasPassword: false, emailVerified: true });
  });

  it("email trùng tài khoản mật khẩu: gộp vào, xóa mật khẩu cũ và đăng xuất phiên cũ (chống chiếm trước email)", async () => {
    const squatter = (await register("chuthat@gmail.com", "ke-xau-dang-ky-truoc")).json();
    const idToken = await t.googleToken({ sub: "g-owner", email: "chuthat@gmail.com", email_verified: true, name: "Chủ thật" });
    const r = await req("POST", "/v1/auth/google", { idToken });
    expect(r.statusCode).toBe(200);
    expect(r.json().user.id).toBe(squatter.user.id);
    expect(r.json().user.hasPassword).toBe(false);
    expect((await req("GET", "/v1/me", undefined, squatter.token)).statusCode).toBe(401);
    expect((await login("chuthat@gmail.com", "ke-xau-dang-ky-truoc")).statusCode).toBe(401);
  });

  it("tài khoản Google đặt mật khẩu (không cần mật khẩu cũ) rồi đăng nhập được bằng email", async () => {
    const idToken = await t.googleToken({ sub: "g-pw", email: "datmk@gmail.com", email_verified: true, name: "Đặt MK" });
    const { token } = (await req("POST", "/v1/auth/google", { idToken })).json();
    expect((await req("POST", "/v1/me/password", { newPassword: "mat-khau-moi-9" }, token)).statusCode).toBe(200);
    expect((await login("datmk@gmail.com", "mat-khau-moi-9")).statusCode).toBe(200);
    // đăng ký lại bằng email này: báo đã có tài khoản
    expect((await register("datmk@gmail.com")).statusCode).toBe(409);
  });

  it("email Google trùng tài khoản Google-only: đăng ký bằng mật khẩu bị chặn kèm hướng dẫn", async () => {
    const r = await register("minh.tran@gmail.com");
    expect(r.statusCode).toBe(409);
    expect(r.json().message).toContain("Google");
  });

  it("token cấp cho ứng dụng khác (sai aud) bị từ chối", async () => {
    const idToken = await t.googleToken({ sub: "g-999" }, "other-app.apps.googleusercontent.com");
    expect((await req("POST", "/v1/auth/google", { idToken })).statusCode).toBe(401);
  });
});

it("một IP đăng ký quá giới hạn mỗi giờ thì bị chặn (429)", async () => {
  const s = await setup({ registerPerIpHour: 2 });
  const codes = [];
  for (const email of ["ip1@test.vn", "ip2@test.vn", "ip3@test.vn"])
    codes.push((await s.app.inject({ method: "POST", url: "/v1/auth/register", payload: { email, password: "matkhau-dai-123", displayName: "IP" } })).statusCode);
  expect(codes).toEqual([201, 201, 429]);
  await s.close();
}, 60_000);
