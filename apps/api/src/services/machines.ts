import {
  badgesFor, computeScores, CPUS, GPUS, SCALE_VERSION, tierOf, type MachineConfig, type MachineInput,
} from "@f2m/shared";
import { sql } from "kysely";
import type { DB } from "../db.js";

/** Đồng bộ danh mục CPU/GPU (packages/shared) vào bảng parts — chạy khi API khởi động */
export async function syncParts(db: DB) {
  const rows = [
    ...CPUS.map((c) => ({ kind: "cpu", name: c.name, release_year: c.releaseYear,
      specs: JSON.stringify({ socket: c.socket, powerW: c.powerW }),
      scores: JSON.stringify({ gaming: c.gaming, single: c.single, render: c.render }) })),
    ...GPUS.map((g) => ({ kind: "gpu", name: g.name, release_year: g.releaseYear,
      specs: JSON.stringify({ vramGb: g.vramGb, pcieLanes: g.pcieLanes, boardPowerW: g.boardPowerW, psuRecommendedW: g.psuRecommendedW, integrated: g.integrated }),
      scores: JSON.stringify({ fps: g.fps, raster: g.raster, rayTracing: g.rayTracing, render: g.render }) })),
  ];
  for (const r of rows) {
    await db.insertInto("parts").values({ ...r, brand: null, scale_version: SCALE_VERSION })
      .onConflict((oc) => oc.columns(["kind", "name"]).doUpdateSet({
        release_year: r.release_year, specs: r.specs, scores: r.scores, scale_version: SCALE_VERSION,
      })).execute();
  }
}

async function partId(db: DB, kind: "cpu" | "gpu", name: string) {
  const p = await db.selectFrom("parts").select("id").where("kind", "=", kind).where("name", "=", name).executeTakeFirst();
  if (!p) throw new Error(`Thiếu linh kiện ${name} trong bảng parts`);
  return p.id;
}

/** Máy chính của người dùng, dạng MachineInput; null nếu chưa khai báo */
export async function loadPrimaryMachine(db: DB, userId: string): Promise<MachineInput | null> {
  const m = await db.selectFrom("machines").selectAll().where("owner_id", "=", userId).where("is_primary", "=", true).executeTakeFirst();
  if (!m) return null;
  const parts = await db.selectFrom("machine_parts as mp").innerJoin("parts as p", "p.id", "mp.part_id")
    .select(["p.kind", "p.name"]).where("mp.machine_id", "=", m.id).where("mp.status", "=", "in_use").execute();
  const cpu = parts.find((p) => p.kind === "cpu")?.name;
  const gpu = parts.find((p) => p.kind === "gpu")?.name;
  if (!cpu || !gpu) return null;
  return {
    cpu, gpu, ramGb: m.ram_gb as MachineInput["ramGb"], ramChannels: m.ram_channels as 1 | 2,
    storage: m.storage as MachineInput["storage"], pcieGen: m.pcie_gen as 3 | 4 | 5, psuW: m.psu_w,
    resolution: m.resolution as MachineInput["resolution"],
  };
}

/**
 * Lưu máy chính: cập nhật thông số; linh kiện bị thay ra giữ lại với status 'replaced' (để gợi ý đăng bán);
 * tính lại điểm theo thang hiện tại.
 */
export async function savePrimaryMachine(db: DB, userId: string, cfg: MachineConfig) {
  return db.transaction().execute(async (tx) => {
    const t = tx as unknown as DB;
    const values = {
      ram_gb: cfg.ramGb, ram_channels: cfg.ramChannels, storage: cfg.storage, pcie_gen: cfg.pcieGen,
      psu_w: cfg.psuW, resolution: cfg.resolution,
    };
    let m = await t.selectFrom("machines").select("id").where("owner_id", "=", userId).where("is_primary", "=", true).executeTakeFirst();
    if (m) await t.updateTable("machines").set({ ...values, updated_at: sql`now()` }).where("id", "=", m.id).execute();
    else m = await t.insertInto("machines").values({ ...values, owner_id: userId, is_primary: true, verified_at: null }).returning("id").executeTakeFirstOrThrow();

    for (const [kind, name] of [["cpu", cfg.cpu.name], ["gpu", cfg.gpu.name]] as const) {
      const pid = await partId(t, kind, name);
      const current = await t.selectFrom("machine_parts as mp").innerJoin("parts as p", "p.id", "mp.part_id")
        .select(["mp.id", "mp.part_id"]).where("mp.machine_id", "=", m.id).where("p.kind", "=", kind).where("mp.status", "=", "in_use")
        .executeTakeFirst();
      if (current?.part_id === pid) continue;
      if (current) await t.updateTable("machine_parts").set({ status: "replaced" }).where("id", "=", current.id).execute();
      await t.insertInto("machine_parts").values({ machine_id: m.id, part_id: pid }).execute();
    }

    const s = computeScores(cfg);
    const row = {
      gaming: Math.round(s.gaming), render: Math.round(s.render), ai: Math.round(s.ai), office: Math.round(s.office),
      power: Math.round(s.power), tier: tierOf(s.power).code, badges: badgesFor(cfg, s).map((b) => b.code),
    };
    await t.insertInto("machine_scores").values({ machine_id: m.id, scale_version: SCALE_VERSION, ...row })
      .onConflict((oc) => oc.columns(["machine_id", "scale_version"]).doUpdateSet({ ...row, computed_at: sql`now()` })).execute();
    return m.id;
  });
}

/** Bảng xếp hạng: máy chính của mọi người, theo điểm sức mạnh ở thang hiện tại */
export async function leaderboard(db: DB, limit = 100) {
  const rows = await db.selectFrom("machines as m")
    .innerJoin("users as u", "u.id", "m.owner_id")
    .innerJoin("machine_scores as s", (j) => j.onRef("s.machine_id", "=", "m.id").on("s.scale_version", "=", SCALE_VERSION))
    .select(["u.id as userId", "u.handle", "u.display_name", "u.province", "m.id as machineId", "m.ram_gb", "m.resolution", "s.power", "s.tier"])
    .where("m.is_primary", "=", true).orderBy("s.power", "desc").limit(limit).execute();
  const parts = rows.length === 0 ? [] : await db.selectFrom("machine_parts as mp").innerJoin("parts as p", "p.id", "mp.part_id")
    .select(["mp.machine_id", "p.kind", "p.name"]).where("mp.status", "=", "in_use")
    .where("mp.machine_id", "in", rows.map((r) => r.machineId)).execute();
  return rows.map((r, i) => ({
    rank: i + 1, userId: r.userId, handle: r.handle, displayName: r.display_name, province: r.province,
    cpu: parts.find((p) => p.machine_id === r.machineId && p.kind === "cpu")?.name ?? null,
    gpu: parts.find((p) => p.machine_id === r.machineId && p.kind === "gpu")?.name ?? null,
    ramGb: r.ram_gb, resolution: r.resolution, power: r.power, tier: r.tier,
  }));
}
