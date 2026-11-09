import { CPUS, GPUS } from "@f2m/shared";
import { sql } from "kysely";
import type { DB } from "../db.js";

/**
 * Tổng hợp số đo hiệu năng theo mẫu linh kiện (chỉ số đo đã xác minh): số người đo, trung vị điểm render đo được,
 * so với điểm trong danh mục và nguồn của điểm đó (Blender Open Data / ước tính / số đo).
 */
export async function benchSummary(db: DB) {
  const rows = await db.selectFrom("bench_results")
    .select([
      "kind", "part",
      sql<number>`count(distinct user_id)`.as("users"),
      sql<number>`count(*)`.as("runs"),
      sql<number>`percentile_cont(0.5) within group (order by points)`.as("median_points"),
      sql<number>`percentile_cont(0.5) within group (order by pct)`.as("median_pct"),
    ])
    .where("trust", "=", "verified").where("part", "is not", null)
    .groupBy(["kind", "part"]).orderBy("kind").orderBy(sql`count(distinct user_id)`, "desc").execute();
  return rows.map((r) => {
    const cat = r.kind === "cpu" ? CPUS.find((c) => c.name === r.part) : GPUS.find((g) => g.name === r.part);
    const source = !cat ? null : r.kind === "cpu" ? (cat as (typeof CPUS)[number]).source.mt : (cat as (typeof GPUS)[number]).renderSource;
    return {
      kind: r.kind, name: r.part!, users: Number(r.users), runs: Number(r.runs),
      medianPoints: Math.round(Number(r.median_points)), medianPct: r.median_pct === null ? null : Math.round(Number(r.median_pct)),
      catalog: cat?.render ?? null, source,
    };
  });
}

/** Số đo gần đây (kể cả chưa xác minh, kèm lý do) */
export async function recentBench(db: DB, limit = 50) {
  return db.selectFrom("bench_results as b").leftJoin("users as u", "u.id", "b.user_id")
    .select(["b.id", "b.kind", "b.part", "b.raw", "b.api", "b.points", "b.pct", "b.trust", "b.flags", "b.tool", "b.created_at", "u.handle"])
    .orderBy("b.created_at", "desc").limit(limit).execute();
}

/** Tệp hiệu chỉnh cho tools/build_parts.py (data/bench-calibration.json) */
export async function benchCalibration(db: DB) {
  const parts = (await benchSummary(db)).map(({ kind, name, users, runs, medianPoints }) => ({ kind, name, users, runs, medianPoints }));
  return { generatedAt: new Date().toISOString(), note: "Số đo Blender Benchmark đã xác minh từ pcdex-scan. build_parts.py chỉ dùng cho mẫu đang ước tính, khi đủ người đo.", parts };
}
