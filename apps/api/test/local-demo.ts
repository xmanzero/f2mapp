/**
 * API tạm để xem giao diện trên máy (không dùng cho test tự động): Postgres trong bộ nhớ + dữ liệu thử.
 * Chạy: npx tsx apps/api/test/local-demo.ts → http://localhost:8199 ; web: API_URL=http://localhost:8199 next start
 * In ra token phiên của người xem để chụp màn hình khi đã đăng nhập.
 */
import { setup, spec } from "./helpers.js";

const t = await setup();
const call = async (method: string, url: string, payload?: unknown, token?: string) =>
  (await t.app.inject({ method: method as "GET", url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} })).json();
const user = async (email: string, displayName: string, province: string | null) => {
  const r = await call("POST", "/v1/auth/register", { email, password: "matkhau-dai-123", displayName });
  if (province) await call("PATCH", "/v1/me", { displayName, handle: r.user.handle, province }, r.token);
  return { token: r.token as string, handle: r.user.handle as string };
};

const a = await user("minh.demo@pcdex.invalid", "Minh Trần", "Hà Nội");
const b = await user("lan.demo@pcdex.invalid", "Lan Phạm", "Đà Nẵng");
const c = await user("viewer.demo@pcdex.invalid", "Người xem", "Hải Phòng");
await call("POST", "/v1/me/machines", { spec: spec({ cpu: "Ryzen 7 7800X3D", gpu: "RTX 4070 Super", resolution: 1440 }), name: "Máy chơi game" }, a.token);
await call("POST", "/v1/me/machines", { spec: spec({ cpu: "Core i5-12400F", gpu: "RTX 3060 12GB" }), name: "Máy làm việc" }, a.token);
await call("POST", "/v1/me/machines", { spec: spec({ cpu: "Core i7-14700", gpu: "GTX 1660 Ti" }) }, b.token);
await call("POST", "/v1/me/machines", { spec: spec() }, c.token);
const pa = await call("GET", `/v1/users/${a.handle}`);
for (const tk of [b.token, c.token]) {
  await call("POST", `/v1/users/${a.handle}/follow`, {}, tk);
  await call("POST", `/v1/machines/${pa.machines[0].id}/like`, {}, tk);
}
await call("POST", `/v1/users/${b.handle}/follow`, {}, a.token);
// một tin đang bán từ linh kiện đã thay ra
const mine = await call("GET", "/v1/me/machines", undefined, a.token);
const gpuPart = mine.machines[mine.machines.length - 1].parts.find((p: { kind: string }) => p.kind === "gpu");
const posted = await call("POST", "/v1/listings", { machinePartId: gpuPart.id, priceVnd: 5_200_000, condition: "used", province: "Hà Nội", contact: "0900000000", durationDays: 7, description: "Card còn đẹp" }, a.token);
console.log("listing", posted.id ?? posted.message ?? JSON.stringify(posted).slice(0, 120));
await t.app.listen({ port: 8199 });
console.log("PROFILE", a.handle, "VIEWER_TOKEN", c.token);
