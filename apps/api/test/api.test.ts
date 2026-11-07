import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const app = buildApp();
const base = { cpu: "Core i5-12400F", gpu: "RTX 3060 12GB", ramGb: 16, ramChannels: 2, storage: "nvme3", pcieGen: 4, psuW: 550, resolution: 1080 };

describe("API", () => {
  it("GET /v1/parts/gpus trả danh mục", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/parts/gpus" });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThan(50);
  });

  it("POST /v1/machines/evaluate tính điểm máy mốc = 10.000", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/machines/evaluate", payload: base });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Math.round(body.scores.power)).toBe(10000);
    expect(body.tier.name).toBe("Vàng");
    expect(body.needs).toHaveLength(4);
  });

  it("linh kiện lạ trả 400 kèm lời giải thích", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/machines/evaluate", payload: { ...base, gpu: "GTX 480" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("GTX 480");
  });

  it("POST /v1/machines/compare báo đổi socket", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/machines/compare",
      payload: { current: { ...base, cpu: "Ryzen 5 3600" }, next: { ...base, cpu: "Ryzen 7 9800X3D" } } });
    expect(res.statusCode).toBe(200);
    expect(res.json().warnings[0].code).toBe("socket_change");
  });
});
