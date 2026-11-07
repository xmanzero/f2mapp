import { computeScores, resolveMachine, tierOf, type MachineInput } from "@f2m/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { maskPhone, normalizeVnPhone } from "../src/auth/phone.js";
import { setup } from "./helpers.js";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); }, 60_000);
afterAll(async () => { await t.close(); });

const machine = { cpu: "Core i5-12400F", gpu: "RTX 3060 12GB", ramGb: 16, ramChannels: 2, storage: "nvme3", pcieGen: 4, psuW: 550, resolution: 1080 };
const post = (url: string, payload: unknown, token?: string) =>
  t.app.inject({ method: "POST", url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });

async function loginByPhone(phone: string) {
  const r1 = await post("/v1/auth/otp/request", { phone });
  expect(r1.statusCode).toBe(200);
  const r2 = await post("/v1/auth/otp/verify", { phone, code: r1.json().devCode });
  expect(r2.statusCode).toBe(200);
  return r2.json() as { token: string; created: boolean; user: { id: string; handle: string } };
}

describe("số điện thoại", () => {
  it("chuẩn hóa số di động Việt Nam", () => {
    expect(normalizeVnPhone("0912 345 678")).toBe("+84912345678");
    expect(normalizeVnPhone("+84 912.345.678")).toBe("+84912345678");
    expect(normalizeVnPhone("84912345678")).toBe("+84912345678");
    expect(normalizeVnPhone("0212345678")).toBeNull(); // không phải đầu số di động
    expect(normalizeVnPhone("091234567")).toBeNull();
    expect(maskPhone("+84912345678")).toBe("0912 *** 678");
  });
});

describe("đăng nhập bằng OTP", () => {
  it("số sai định dạng trả 400 kèm hướng dẫn", async () => {
    const r = await post("/v1/auth/otp/request", { phone: "12345" });
    expect(r.statusCode).toBe(400);
    expect(r.json().message).toContain("0912 345 678");
  });

  it("gửi mã, chặn gửi lại trong 60 giây, SMS chứa đúng mã", async () => {
    const r = await post("/v1/auth/otp/request", { phone: "0987654321" });
    expect(r.json().devCode).toMatch(/^\d{6}$/);
    expect(t.sms.sent.at(-1)!.text).toContain(r.json().devCode);
    const again = await post("/v1/auth/otp/request", { phone: "0987654321" });
    expect(again.statusCode).toBe(429);
  });

  it("mã sai báo số lần còn lại; sai 5 lần thì khóa mã", async () => {
    const phone = "0911111111";
    const { devCode } = (await post("/v1/auth/otp/request", { phone })).json();
    const wrong = devCode === "000000" ? "111111" : "000000";
    const r = await post("/v1/auth/otp/verify", { phone, code: wrong });
    expect(r.statusCode).toBe(400);
    expect(r.json().message).toContain("Còn 4 lần");
    for (let i = 0; i < 4; i++) await post("/v1/auth/otp/verify", { phone, code: wrong });
    const locked = await post("/v1/auth/otp/verify", { phone, code: devCode });
    expect(locked.statusCode).toBe(429);
  });

  it("mã đúng tạo tài khoản + phiên; mã chỉ dùng được một lần", async () => {
    const phone = "0922222222";
    const { devCode } = (await post("/v1/auth/otp/request", { phone })).json();
    const r = await post("/v1/auth/otp/verify", { phone, code: devCode });
    expect(r.statusCode).toBe(200);
    expect(r.json().created).toBe(true);
    expect(r.headers["set-cookie"]).toContain("f2m_session=");
    const reuse = await post("/v1/auth/otp/verify", { phone, code: devCode });
    expect(reuse.statusCode).toBe(400);
  });
});

describe("tài khoản và máy", () => {
  it("/v1/me cần đăng nhập; hồ sơ che số điện thoại", async () => {
    expect((await t.app.inject({ method: "GET", url: "/v1/me" })).statusCode).toBe(401);
    const { token } = await loginByPhone("0933333333");
    const me = await t.app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${token}` } });
    expect(me.json().user.phone).toBe("0933 *** 333");
    expect(me.json().machine).toBeNull();
  });

  it("đăng nhập lại cùng số thì vào đúng tài khoản cũ", async () => {
    const a = await loginByPhone("0944444444");
    await new Promise((r) => setTimeout(r, 5));
    await t.db.updateTable("otp_codes").set({ created_at: new Date(Date.now() - 120_000) }).where("phone", "=", "+84944444444").execute();
    const b = await loginByPhone("0944444444");
    expect(b.user.id).toBe(a.user.id);
    expect(b.created).toBe(false);
  });

  it("lưu máy, tính điểm, thay card thì card cũ thành 'replaced', có tên trên bảng xếp hạng", async () => {
    const { token, user } = await loginByPhone("0955555555");
    const put = (m: object) => t.app.inject({ method: "PUT", url: "/v1/me/machine", payload: m, headers: { authorization: `Bearer ${token}` } });
    const r = await put(machine);
    expect(r.statusCode).toBe(200);
    expect(Math.round(r.json().scores.power)).toBe(10000);

    await put({ ...machine, gpu: "RTX 4070 Super" });
    const got = await t.app.inject({ method: "GET", url: "/v1/me/machine", headers: { authorization: `Bearer ${token}` } });
    expect(got.json().machine.gpu).toBe("RTX 4070 Super");
    const replaced = await t.db.selectFrom("machine_parts as mp").innerJoin("parts as p", "p.id", "mp.part_id")
      .select(["p.name", "mp.status"]).where("mp.status", "=", "replaced").execute();
    expect(replaced.map((x) => x.name)).toContain("RTX 3060 12GB");

    const board = (await t.app.inject({ method: "GET", url: "/v1/leaderboard" })).json();
    const row = board.items.find((x: { userId: string }) => x.userId === user.id);
    const expected = computeScores(resolveMachine({ ...machine, gpu: "RTX 4070 Super" } as MachineInput)).power;
    expect(row).toMatchObject({ gpu: "RTX 4070 Super", cpu: "Core i5-12400F", power: Math.round(expected), tier: tierOf(expected).code });
  });

  it("đổi tên tài khoản: trùng thì 409, sai định dạng thì 400", async () => {
    const a = await loginByPhone("0966666666");
    const b = await loginByPhone("0977777777");
    const patch = (token: string, payload: object) =>
      t.app.inject({ method: "PATCH", url: "/v1/me", payload, headers: { authorization: `Bearer ${token}` } });
    expect((await patch(a.token, { handle: "khoa.pc", displayName: "Khoa", province: "Hà Nội" })).json().user.handle).toBe("khoa.pc");
    expect((await patch(b.token, { handle: "khoa.pc" })).statusCode).toBe(409);
    expect((await patch(b.token, { handle: "Có Dấu" })).statusCode).toBe(400);
  });

  it("đăng xuất thì token hết hiệu lực", async () => {
    const { token } = await loginByPhone("0988888888");
    expect((await post("/v1/auth/logout", {}, token)).statusCode).toBe(200);
    expect((await t.app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
  });
});

it("một IP xin mã quá giới hạn mỗi giờ thì bị chặn (429)", async () => {
  const s = await setup({ otpRequestsPerIpHour: 3 });
  const codes = [];
  for (const phone of ["0901000001", "0901000002", "0901000003", "0901000004"])
    codes.push((await s.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone } })).statusCode);
  expect(codes).toEqual([200, 200, 200, 429]);
  await s.close();
}, 60_000);

describe("đăng nhập Google", () => {
  it("token hợp lệ tạo tài khoản, handle lấy từ email", async () => {
    const idToken = await t.googleToken({ sub: "g-123", email: "minh.tran@gmail.com", email_verified: true, name: "Minh Trần" });
    const r = await post("/v1/auth/google", { idToken });
    expect(r.statusCode).toBe(200);
    expect(r.json().user).toMatchObject({ displayName: "Minh Trần", handle: "minh.tran", providers: ["google"] });
  });
  it("token cấp cho ứng dụng khác (sai aud) bị từ chối", async () => {
    const idToken = await t.googleToken({ sub: "g-999" }, "other-app.apps.googleusercontent.com");
    expect((await post("/v1/auth/google", { idToken })).statusCode).toBe(401);
  });
});
