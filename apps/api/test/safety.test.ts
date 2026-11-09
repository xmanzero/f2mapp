import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setup } from "./helpers.js";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); }, 60_000);
afterAll(async () => { await t.close(); });

const req = (method: string, url: string, payload?: unknown, token?: string) =>
  t.app.inject({ method: method as "GET", url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
const register = async (email: string) => {
  const r = (await req("POST", "/v1/auth/register", { email, password: "matkhau-dai-123", displayName: email.split("@")[0] })).json();
  return { token: r.token as string, handle: r.user.handle as string, id: r.user.id as string };
};

describe("chặn, báo cáo, ảnh trong tin nhắn", () => {
  it("chặn: gỡ theo dõi, hai bên không nhắn được, không theo dõi lại được; bỏ chặn thì nhắn lại được", async () => {
    const a = await register("blockA@test.vn");
    const b = await register("blockB@test.vn");
    await req("POST", `/v1/users/${b.handle}/follow`, {}, a.token);
    const conv = (await req("POST", "/v1/conversations", { handle: b.handle }, a.token)).json().id;
    await req("POST", `/v1/conversations/${conv}/messages`, { body: "chào" }, a.token);

    expect((await req("POST", `/v1/users/${a.handle}/block`, {}, b.token)).json()).toEqual({ blocked: true });
    expect((await req("GET", `/v1/users/${b.handle}`, undefined, a.token)).json().followers).toBe(0);
    const send = await req("POST", `/v1/conversations/${conv}/messages`, { body: "sao không trả lời" }, a.token);
    expect(send.statusCode).toBe(403);
    expect((await req("POST", `/v1/conversations/${conv}/messages`, { body: "xin lỗi" }, b.token)).statusCode).toBe(403);
    expect((await req("POST", "/v1/conversations", { handle: b.handle }, a.token)).statusCode).toBe(403);
    expect((await req("POST", `/v1/users/${b.handle}/follow`, {}, a.token)).statusCode).toBe(403);
    const open = (await req("GET", `/v1/conversations/${conv}`, undefined, b.token)).json();
    expect(open.conversation).toMatchObject({ blocked: true, canSend: false });
    expect((await req("GET", `/v1/users/${a.handle}`, undefined, b.token)).json().blocked).toBe(true);
    expect((await req("GET", "/v1/me/blocks", undefined, b.token)).json().items.map((x: { handle: string }) => x.handle)).toEqual([a.handle]);

    await req("DELETE", `/v1/users/${a.handle}/block`, undefined, b.token);
    expect((await req("POST", `/v1/conversations/${conv}/messages`, { body: "được rồi" }, a.token)).statusCode).toBe(200);
  });

  it("ảnh: đổi sang WebP, thu nhỏ; chỉ người trong hội thoại xem được", async () => {
    const a = await register("imgA@test.vn");
    const b = await register("imgB@test.vn");
    const c = await register("imgC@test.vn");
    const conv = (await req("POST", "/v1/conversations", { handle: b.handle }, a.token)).json().id;
    const png = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#3366ff" } }).png().toBuffer();
    const up = await t.app.inject({ method: "POST", url: `/v1/conversations/${conv}/images`, payload: png, headers: { authorization: `Bearer ${a.token}`, "content-type": "image/png" } });
    expect(up.statusCode).toBe(200);
    const img = up.json().message.image;
    expect(img).toMatchObject({ width: 1600, height: 1067 });
    const got = await req("GET", `/v1/messages/images/${img.id}`, undefined, b.token);
    expect(got.headers["content-type"]).toBe("image/webp");
    expect((await sharp(got.rawPayload).metadata()).format).toBe("webp");
    expect((await req("GET", `/v1/messages/images/${img.id}`, undefined, c.token)).statusCode).toBe(404);
    const inbox = (await req("GET", "/v1/conversations", undefined, b.token)).json();
    expect(inbox.items[0].last).toMatchObject({ image: true, body: "" });
    const bad = await t.app.inject({ method: "POST", url: `/v1/conversations/${conv}/images`, payload: Buffer.from("không phải ảnh"), headers: { authorization: `Bearer ${a.token}`, "content-type": "image/png" } });
    expect(bad.statusCode).toBe(415);
  });

  it("báo cáo từ hội thoại → quản trị viên đọc được hội thoại đó (kể cả ảnh), xử lý xong thì đóng", async () => {
    const bad = await register("rptBad@test.vn");
    const victim = await register("rptVictim@test.vn");
    const adm = await register("rptAdmin@test.vn");
    await t.db.updateTable("users").set({ role: "admin" }).where("id", "=", adm.id).execute();
    const conv = (await req("POST", "/v1/conversations", { handle: victim.handle }, bad.token)).json().id;
    await req("POST", `/v1/conversations/${conv}/messages`, { body: "Chuyển khoản trước 2 triệu đi rồi anh gửi hàng" }, bad.token);
    const png = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#ff0000" } }).png().toBuffer();
    const img = (await t.app.inject({ method: "POST", url: `/v1/conversations/${conv}/images`, payload: png, headers: { authorization: `Bearer ${bad.token}`, "content-type": "image/png" } })).json().message.image;
    // quản trị viên chưa xem được ảnh khi chưa có báo cáo
    expect((await req("GET", `/v1/messages/images/${img.id}`, undefined, adm.token)).statusCode).toBe(404);

    const r = await req("POST", "/v1/reports", { handle: bad.handle, conversationId: conv, reason: "scam", note: "Đòi chuyển tiền trước", block: true }, victim.token);
    expect(r.statusCode).toBe(200);
    expect((await req("POST", `/v1/conversations/${conv}/messages`, { body: "?" }, bad.token)).statusCode).toBe(403);
    expect((await req("POST", "/v1/reports", { handle: victim.handle, reason: "spam" }, victim.token)).statusCode).toBe(400);

    expect((await req("GET", "/v1/admin/reports", undefined, victim.token)).statusCode).toBe(403);
    const list = (await req("GET", "/v1/admin/reports", undefined, adm.token)).json().items;
    expect(list[0]).toMatchObject({ reason: "scam", targetHandle: bad.handle, reporterHandle: victim.handle, status: "open", targetReports: 1 });
    const d = (await req("GET", `/v1/admin/reports/${list[0].id}`, undefined, adm.token)).json();
    expect(d.messages.map((m: { body: string }) => m.body)).toContain("Chuyển khoản trước 2 triệu đi rồi anh gửi hàng");
    expect(d.messages.find((m: { image: unknown }) => m.image)?.isTarget).toBe(true);
    expect((await req("GET", `/v1/messages/images/${img.id}`, undefined, adm.token)).statusCode).toBe(200);

    expect((await req("POST", `/v1/admin/reports/${list[0].id}/resolve`, { status: "resolved", note: "Đã khóa tài khoản" }, adm.token)).statusCode).toBe(200);
    expect((await req("GET", "/v1/admin/reports", undefined, adm.token)).json().items).toEqual([]);
    expect((await req("GET", "/v1/admin/reports?status=closed", undefined, adm.token)).json().items[0]).toMatchObject({ status: "resolved", resolution_note: "Đã khóa tài khoản" });
  });
});
