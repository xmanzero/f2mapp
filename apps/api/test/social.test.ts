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

describe("cộng đồng: hồ sơ, theo dõi, thích", () => {
  it("hồ sơ công khai có máy, điểm, hạng; theo dõi / bỏ theo dõi; thích máy người khác", async () => {
    const a = await register("socialA@test.vn");
    const b = await register("socialB@test.vn");
    await req("POST", "/v1/me/machines", { spec: spec() }, a.token);

    const p = (await req("GET", `/v1/users/${a.handle.toUpperCase()}`)).json();
    expect(p.user.handle).toBe(a.handle);
    expect(p.machines).toHaveLength(1);
    expect(p.machines[0]).toMatchObject({ isPrimary: true, likes: 0, liked: false, tier: expect.any(String) });
    expect(p.machines[0].power).toBeGreaterThan(0);
    expect(p.rank).toMatchObject({ rank: expect.any(Number), of: expect.any(Number) });
    expect(p).toMatchObject({ followers: 0, followingCount: 0, following: false, me: false });

    // theo dõi: cần đăng nhập, không tự theo dõi, bấm hai lần không tính hai
    expect((await req("POST", `/v1/users/${a.handle}/follow`)).statusCode).toBe(401);
    expect((await req("POST", `/v1/users/${b.handle}/follow`, {}, b.token)).statusCode).toBe(400);
    await req("POST", `/v1/users/${a.handle}/follow`, {}, b.token);
    expect((await req("POST", `/v1/users/${a.handle}/follow`, {}, b.token)).json()).toEqual({ following: true, followers: 1 });
    const seen = (await req("GET", `/v1/users/${a.handle}`, undefined, b.token)).json();
    expect(seen).toMatchObject({ following: true, followers: 1 });
    expect((await req("GET", `/v1/users/${a.handle}/followers`)).json().items.map((x: { handle: string }) => x.handle)).toEqual([b.handle]);
    expect((await req("GET", `/v1/users/${b.handle}/following`)).json().items[0]).toMatchObject({ handle: a.handle, tier: expect.any(String) });
    expect((await req("GET", "/v1/me/following", undefined, b.token)).json().ids).toEqual([p.user.id]);

    // thích máy: không thích máy mình, đếm đúng, bỏ thích
    const mid = p.machines[0].id as string;
    expect((await req("POST", `/v1/machines/${mid}/like`, {}, a.token)).statusCode).toBe(400);
    expect((await req("POST", `/v1/machines/${mid}/like`, {}, b.token)).json()).toEqual({ liked: true, likes: 1 });
    expect((await req("GET", `/v1/users/${a.handle}`, undefined, b.token)).json().machines[0]).toMatchObject({ likes: 1, liked: true });
    const board = (await req("GET", "/v1/leaderboard")).json().items as { handle: string; likes: number }[];
    expect(board.find((x) => x.handle === a.handle)?.likes).toBe(1);
    expect((await req("DELETE", `/v1/machines/${mid}/like`, undefined, b.token)).json()).toEqual({ liked: false, likes: 0 });
    expect((await req("DELETE", `/v1/users/${a.handle}/follow`, undefined, b.token)).json()).toEqual({ following: false, followers: 0 });
  });

  it("không có / tên lạ → 404 (tiếng Anh khi x-lang: en)", async () => {
    expect((await req("GET", "/v1/users/khong-co-ai-ten-nay")).statusCode).toBe(404);
    const r = await t.app.inject({ method: "GET", url: "/v1/users/a'b", headers: { "x-lang": "en" } });
    expect(r.json().message).toBe("User not found");
  });
});
