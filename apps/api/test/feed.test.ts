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
type Item = { kind: string; data: Record<string, unknown>; user: { handle: string }; mine: boolean };

describe("bảng tin & thông báo", () => {
  it("theo dõi → thấy hoạt động; đổi linh kiện liên tiếp gộp một dòng; đổi về như cũ thì mất; thông báo theo dõi / thích", async () => {
    const a = await register("feedA@test.vn");
    const b = await register("feedB@test.vn");
    expect((await req("GET", "/v1/feed")).statusCode).toBe(401);
    // B chưa theo dõi ai: có gợi ý theo dõi
    await req("POST", "/v1/me/machines", { spec: spec({ gpu: "RTX 3060 12GB" }) }, a.token);
    const empty = (await req("GET", "/v1/feed", undefined, b.token)).json();
    expect(empty.items).toEqual([]);
    expect(empty.suggestions.map((s: { handle: string }) => s.handle)).toContain(a.handle);

    await req("POST", `/v1/users/${a.handle}/follow`, {}, b.token);
    const n = (await req("GET", "/v1/notifications", undefined, a.token)).json();
    expect(n.unread).toBe(1);
    expect(n.items[0]).toMatchObject({ kind: "follow", read: false, actor: { handle: b.handle } });

    const mid = (await req("GET", "/v1/me/machines", undefined, a.token)).json().machines[0].id as string;
    // thử 3 card liên tiếp → một dòng "RTX 3060 12GB → RTX 4080"
    for (const gpu of ["RTX 4060", "RTX 4070", "RTX 4080"]) await req("PUT", `/v1/me/machines/${mid}`, { spec: spec({ gpu }) }, a.token);
    let items = (await req("GET", "/v1/feed", undefined, b.token)).json().items as Item[];
    const changes = items.filter((i) => i.kind === "part_changed");
    expect(changes).toHaveLength(1);
    expect(changes[0]!.data).toMatchObject({ kind: "gpu", from: "RTX 3060 12GB", to: "RTX 4080" });
    expect(items.some((i) => i.kind === "machine_added" && i.user.handle === a.handle)).toBe(true);
    expect(items.some((i) => i.kind === "tier_up")).toBe(true);
    // đổi về card cũ → dòng đổi linh kiện và lên hạng biến mất
    await req("PUT", `/v1/me/machines/${mid}`, { spec: spec({ gpu: "RTX 3060 12GB" }) }, a.token);
    items = (await req("GET", "/v1/feed", undefined, b.token)).json().items as Item[];
    expect(items.filter((i) => i.kind === "part_changed" || i.kind === "tier_up")).toEqual([]);

    // thích → thông báo; bỏ thích → thông báo chưa đọc biến mất; đọc hết → 0
    await req("POST", `/v1/machines/${mid}/like`, {}, b.token);
    expect((await req("GET", "/v1/notifications/unread", undefined, a.token)).json().unread).toBe(2);
    await req("DELETE", `/v1/machines/${mid}/like`, undefined, b.token);
    expect((await req("GET", "/v1/notifications/unread", undefined, a.token)).json().unread).toBe(1);
    await req("POST", "/v1/notifications/read", {}, a.token);
    expect((await req("GET", "/v1/notifications/unread", undefined, a.token)).json().unread).toBe(0);
  });

  it("đăng tin bán hiện trên bảng tin", async () => {
    const c = await register("feedC@test.vn");
    await req("POST", "/v1/me/machines", { spec: spec() }, c.token);
    const part = (await req("GET", "/v1/me/machines", undefined, c.token)).json().machines[0].parts.find((p: { kind: string }) => p.kind === "ram");
    await req("POST", "/v1/listings", { machinePartId: part.id, priceVnd: 900_000, condition: "used", province: "Hà Nội", contact: "0900000000", durationDays: 7 }, c.token);
    const items = (await req("GET", "/v1/feed", undefined, c.token)).json().items as Item[];
    expect(items.find((i) => i.kind === "listing_posted")).toMatchObject({ mine: true, data: { priceVnd: 900_000, kind: "ram" } });
  });
});
