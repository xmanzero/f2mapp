import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setup, spec } from "./helpers.js";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); }, 60_000);
afterAll(async () => { await t.close(); });

const req = (method: string, url: string, payload?: unknown, token?: string) =>
  t.app.inject({ method: method as "GET", url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
const register = async (email: string) => {
  const r = (await req("POST", "/v1/auth/register", { email, password: "matkhau-dai-123", displayName: email.split("@")[0] })).json();
  return { token: r.token as string, handle: r.user.handle as string };
};

describe("tin nhắn", () => {
  it("người mua nhắn người bán về một tin; hội thoại dùng lại; chưa đọc; người ngoài không đọc được", async () => {
    const seller = await register("msgSeller@test.vn");
    const buyer = await register("msgBuyer@test.vn");
    const other = await register("msgOther@test.vn");
    await req("POST", "/v1/me/machines", { spec: spec() }, seller.token);
    const part = (await req("GET", "/v1/me/machines", undefined, seller.token)).json().machines[0].parts.find((p: { kind: string }) => p.kind === "gpu");
    const listing = (await req("POST", "/v1/listings", { machinePartId: part.id, priceVnd: 5_000_000, condition: "used", province: "Hà Nội", contact: "0900000000", durationDays: 7 }, seller.token)).json();
    const listingId = listing.item?.id ?? listing.id;

    expect((await req("POST", "/v1/conversations", { listingId })).statusCode).toBe(401);
    expect((await req("POST", "/v1/conversations", { listingId }, seller.token)).json().message).toBe("Không nhắn tin cho chính mình được");
    const c1 = (await req("POST", "/v1/conversations", { listingId }, buyer.token)).json().id as string;
    expect((await req("POST", "/v1/conversations", { listingId }, buyer.token)).json().id).toBe(c1);
    // hội thoại chưa có tin nào thì chưa hiện trong hộp thư người bán
    expect((await req("GET", "/v1/conversations", undefined, seller.token)).json().items).toEqual([]);

    expect((await req("POST", `/v1/conversations/${c1}/messages`, { body: "   " }, buyer.token)).statusCode).toBe(400);
    await req("POST", `/v1/conversations/${c1}/messages`, { body: "Card còn bảo hành không anh?" }, buyer.token);
    await req("POST", `/v1/conversations/${c1}/messages`, { body: "Giá có bớt không?" }, buyer.token);
    expect((await req("GET", "/v1/messages/unread", undefined, seller.token)).json().unread).toBe(2);
    const inbox = (await req("GET", "/v1/conversations", undefined, seller.token)).json();
    expect(inbox.items[0]).toMatchObject({ id: c1, unread: 2, other: { handle: buyer.handle }, listing: { id: listingId, priceVnd: 5_000_000 }, last: { body: "Giá có bớt không?", mine: false } });

    // mở hội thoại → đã đọc; trả lời
    const open = (await req("GET", `/v1/conversations/${c1}`, undefined, seller.token)).json();
    expect(open.messages.map((m: { body: string }) => m.body)).toEqual(["Card còn bảo hành không anh?", "Giá có bớt không?"]);
    expect((await req("GET", "/v1/messages/unread", undefined, seller.token)).json().unread).toBe(0);
    await req("POST", `/v1/conversations/${c1}/messages`, { body: "Còn 6 tháng, bớt 200k" }, seller.token);
    const after = (await req("GET", `/v1/conversations/${c1}?after=${encodeURIComponent(open.messages[1].createdAt)}`, undefined, buyer.token)).json();
    expect(after.messages).toEqual([expect.objectContaining({ body: "Còn 6 tháng, bớt 200k", mine: false })]);

    // người ngoài
    expect((await req("GET", `/v1/conversations/${c1}`, undefined, other.token)).statusCode).toBe(404);
    expect((await req("POST", `/v1/conversations/${c1}/messages`, { body: "xin chào" }, other.token)).statusCode).toBe(404);
    // nhắn trực tiếp từ hồ sơ: hội thoại riêng (không gắn tin)
    const c2 = (await req("POST", "/v1/conversations", { handle: seller.handle }, buyer.token)).json().id;
    expect(c2).not.toBe(c1);
    const tooLong = await t.app.inject({ method: "POST", url: `/v1/conversations/${c2}/messages`, payload: { body: "a".repeat(2100) }, headers: { authorization: `Bearer ${buyer.token}`, "x-lang": "en" } });
    expect(tooLong.json().message).toBe("Messages can be at most 2000 characters");
  });
});
