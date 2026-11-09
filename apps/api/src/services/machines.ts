import {
  badgesFor, benchForSpec, computeScores, CPUS, GPUS, MAX_MACHINES, partKey, partLabel, resolveMachine, sameScannedPart, SCALE_VERSION, specFromInput, specToInput,
  tierOf, VERIFIABLE_KINDS, type BenchResult, type Drive, type MachineConfig, type MachineInput, type MachineSpec, type PartKind, type RamKit,
} from "@f2m/shared";
import { sql } from "kysely";
import type { DB } from "../db.js";

/** Linh kiện vừa thêm rồi bỏ trong khoảng này coi là sửa nhầm */
export const CORRECTION_MS = 30 * 60_000;

export class MachineError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

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
  if (!p) throw new MachineError(400, `Không có "${name}" trong danh mục`);
  return p.id;
}

/** Một linh kiện mong muốn trong máy, sau khi phân rã MachineSpec */
interface Want { kind: PartKind; key: string; label: string; partName: string | null; details: object }
function explode(spec: MachineSpec): Want[] {
  return [
    { kind: "cpu", key: `cpu|${spec.cpu}`, label: spec.cpu, partName: spec.cpu, details: {} },
    { kind: "gpu", key: `gpu|${spec.gpu}`, label: spec.gpu, partName: spec.gpu, details: {} },
    { kind: "mainboard", key: partKey.mainboard(spec.mainboard), label: partLabel.mainboard(spec.mainboard), partName: null, details: spec.mainboard },
    ...spec.ram.map((k) => ({ kind: "ram" as const, key: partKey.ram(k), label: partLabel.ram(k), partName: null, details: k })),
    ...spec.drives.map((d) => ({ kind: "storage" as const, key: partKey.drive(d), label: partLabel.drive(d), partName: null, details: d })),
    { kind: "psu", key: partKey.psu(spec.psu), label: partLabel.psu(spec.psu), partName: null, details: spec.psu },
  ];
}
const keyOf = (row: { kind: PartKind; label: string; details: unknown }): string => {
  const d = row.details as never;
  switch (row.kind) {
    case "cpu": case "gpu": return `${row.kind}|${row.label}`;
    case "mainboard": return partKey.mainboard(d);
    case "ram": return partKey.ram(d);
    case "storage": return partKey.drive(d);
    case "psu": return partKey.psu(d);
  }
};

type MachineRow = { id: string; name: string; is_primary: boolean; ram_gb: number; ram_channels: number; storage: string; pcie_gen: number; psu_w: number; resolution: number; last_scan_at: Date | null; bench: unknown };
/** Số đo hiệu năng còn đúng với CPU / card đang lắp */
const benchOf = (m: MachineRow, spec: MachineSpec) => benchForSpec(m.bench as BenchResult | null, spec);
const summaryOf = (m: MachineRow, cpu: string, gpu: string): MachineInput => ({
  cpu, gpu, ramGb: m.ram_gb, ramChannels: m.ram_channels as 1 | 2, storage: m.storage as MachineInput["storage"],
  pcieGen: m.pcie_gen as 3 | 4 | 5, psuW: m.psu_w, resolution: m.resolution as MachineInput["resolution"],
});

async function partsOf(db: DB, machineId: string) {
  return db.selectFrom("machine_parts").select(["id", "kind", "label", "details", "status", "verified_at", "added_at", "replaced_at", "part_id"])
    .where("machine_id", "=", machineId).orderBy("added_at").execute();
}

/**
 * Dựng MachineSpec từ linh kiện đang lắp. Máy khai báo kiểu cũ (chỉ có CPU/card) thì bù phần thiếu từ các cột tóm tắt.
 * Linh kiện đang lắp đã bán mà chưa thay: dùng tạm linh kiện đã bán để vẫn tính được điểm, và báo trong `missing`.
 */
function buildSpec(m: MachineRow, parts: Awaited<ReturnType<typeof partsOf>>) {
  const inUse = parts.filter((p) => p.status === "in_use");
  const sold = parts.filter((p) => p.status === "sold").reverse();
  const missing: PartKind[] = [];
  const one = (kind: PartKind) => {
    const p = inUse.find((x) => x.kind === kind);
    if (p) return p;
    const s = sold.find((x) => x.kind === kind);
    if (s) missing.push(kind);
    return s;
  };
  const cpu = one("cpu")?.label, gpu = one("gpu")?.label;
  if (!cpu || !gpu) return null;
  const legacy = specFromInput(summaryOf(m, cpu, gpu));
  const mb = one("mainboard"), psu = one("psu");
  const ram = inUse.filter((p) => p.kind === "ram").map((p) => p.details as RamKit);
  const drives = inUse.filter((p) => p.kind === "storage").map((p) => p.details as Drive);
  const spec: MachineSpec = {
    cpu, gpu,
    mainboard: mb ? (mb.details as MachineSpec["mainboard"]) : legacy.mainboard,
    ram: ram.length ? ram : legacy.ram,
    drives: drives.length ? drives : legacy.drives,
    psu: psu ? (psu.details as MachineSpec["psu"]) : legacy.psu,
    resolution: m.resolution as MachineSpec["resolution"],
  };
  return { spec, missing };
}

/**
 * Máy khai từ trước khi có cấu hình chi tiết chỉ có dòng CPU + card; mainboard, RAM, ổ, nguồn nằm ở cột tóm tắt.
 * Tạo các dòng còn thiếu thành linh kiện thật (để bán được). Trả về true nếu có tạo.
 */
async function materializeLegacy(db: DB, machineId: string, spec: MachineSpec, parts: Awaited<ReturnType<typeof partsOf>>) {
  const has = (k: PartKind) => parts.some((p) => p.kind === k && p.status !== "replaced");
  const wants = explode(spec).filter((w) => !has(w.kind));
  for (const w of wants)
    await db.insertInto("machine_parts").values({
      machine_id: machineId, kind: w.kind, label: w.label, details: JSON.stringify(w.details), verified_at: null, replaced_at: null, part_id: null,
    }).execute();
  return wants.length > 0;
}

const machineCols = ["id", "name", "is_primary", "ram_gb", "ram_channels", "storage", "pcie_gen", "psu_w", "resolution", "last_scan_at", "bench"] as const;

/** Các máy của người dùng (tối đa 2), kèm linh kiện, trạng thái xác thực và điểm */
export async function loadMachines(db: DB, userId: string) {
  const ms = await db.selectFrom("machines").select(machineCols).where("owner_id", "=", userId)
    .orderBy("is_primary", "desc").orderBy("created_at").execute();
  const out = [];
  for (const m of ms) {
    let parts = await partsOf(db, m.id);
    const built = buildSpec(m, parts);
    if (!built) continue;
    if (await materializeLegacy(db, m.id, built.spec, parts)) parts = await partsOf(db, m.id);
    const listed = await db.selectFrom("listings").select(["id", "machine_part_id"]).where("seller_id", "=", userId)
      .where("status", "in", ["active", "reserved"]).where("machine_part_id", "in", parts.length ? parts.map((p) => p.id) : ["00000000-0000-0000-0000-000000000000"]).execute();
    const view = parts.filter((p) => p.status !== "sold" || built.missing.includes(p.kind)).map((p) => ({
      id: p.id, kind: p.kind, label: p.label, details: p.details, status: p.status,
      // "xác thực đang dùng": phần mềm quét đã thấy và linh kiện vẫn còn trong máy
      verified: !!p.verified_at && p.status === "in_use", verifiedAt: p.verified_at, addedAt: p.added_at, replacedAt: p.replaced_at,
      listingId: listed.find((l) => l.machine_part_id === p.id)?.id ?? null,
    }));
    const verifiable = view.filter((p) => p.status === "in_use" && VERIFIABLE_KINDS.includes(p.kind));
    const input = specToInput(built.spec);
    const s = computeScores(resolveMachine(input));
    out.push({
      id: m.id, name: m.name, isPrimary: m.is_primary, spec: built.spec, input, missing: built.missing, parts: view,
      verified: verifiable.length > 0 && verifiable.every((p) => p.verified), lastScanAt: m.last_scan_at, bench: benchOf(m, built.spec),
      power: Math.round(s.power), tier: tierOf(s.power).code,
    });
  }
  return out;
}

/**
 * Lưu cấu hình chi tiết. machineId = null → tạo máy mới (tối đa 2; máy đầu tiên là máy chính).
 * Linh kiện cùng khóa giữ nguyên (kể cả trạng thái xác thực, cập nhật chi tiết như sức khỏe ổ);
 * linh kiện bị bỏ ra → "đã thay ra"; linh kiện mới → "chưa xác thực".
 */
export async function saveSpec(db: DB, userId: string, machineId: string | null, spec: MachineSpec, name?: string, opts: { loose?: boolean } = {}) {
  const cfg = resolveMachine(specToInput(spec));
  return db.transaction().execute(async (tx) => {
    const t = tx as unknown as DB;
    const input = specToInput(spec);
    const summary = { ram_gb: input.ramGb, ram_channels: input.ramChannels, storage: input.storage, pcie_gen: input.pcieGen, psu_w: input.psuW, resolution: input.resolution };
    let id = machineId;
    if (id) {
      const own = await t.selectFrom("machines").select("id").where("id", "=", id).where("owner_id", "=", userId).executeTakeFirst();
      if (!own) throw new MachineError(404, "Không tìm thấy máy");
      await t.updateTable("machines").set({ ...summary, ...(name && { name }), updated_at: sql`now()` }).where("id", "=", id).execute();
    } else {
      const count = await t.selectFrom("machines").select((eb) => eb.fn.countAll<string>().as("n")).where("owner_id", "=", userId).executeTakeFirstOrThrow();
      if (Number(count.n) >= MAX_MACHINES) throw new MachineError(409, `Mỗi tài khoản khai báo tối đa ${MAX_MACHINES} máy.`);
      id = (await t.insertInto("machines").values({
        ...summary, owner_id: userId, is_primary: Number(count.n) === 0, verified_at: null,
        ...(name && { name }),
      }).returning("id").executeTakeFirstOrThrow()).id;
    }

    const existing = (await partsOf(t, id)).filter((p) => p.status === "in_use");
    const used = new Set<string>();
    const wants = explode(spec);
    // Khớp đúng khóa trước; chế độ quét máy khớp thêm kiểu lỏng (bản quét đọc thêm chi tiết người dùng chưa khai)
    const matched = new Map<Want, (typeof existing)[number]>();
    for (const w of wants) {
      const m = existing.find((p) => !used.has(p.id) && p.kind === w.kind && keyOf(p) === w.key);
      if (m) { matched.set(w, m); used.add(m.id); }
    }
    if (opts.loose) for (const w of wants) {
      if (matched.has(w)) continue;
      const m = existing.find((p) => !used.has(p.id) && p.kind === w.kind && sameScannedPart(w.kind, p.details, w.details, p.label, w.label));
      if (m) { matched.set(w, m); used.add(m.id); }
    }
    for (const w of wants) {
      const match = matched.get(w);
      if (match) {
        // CPU / card là mẫu gần đúng (từ lần quét) thì giữ dấu đó khi người dùng sửa phần khác
        const keep = (match.kind === "cpu" || match.kind === "gpu") && match.label === w.label ? (match.details as { substituteFor?: string } | null)?.substituteFor : undefined;
        await t.updateTable("machine_parts").set({ details: JSON.stringify(keep ? { ...w.details, substituteFor: keep } : w.details), label: w.label }).where("id", "=", match.id).execute();
      } else {
        await t.insertInto("machine_parts").values({
          machine_id: id, kind: w.kind, label: w.label, details: JSON.stringify(w.details), verified_at: null, replaced_at: null,
          part_id: w.partName ? await partId(t, w.kind as "cpu" | "gpu", w.partName) : null,
        }).execute();
      }
    }
    // Linh kiện bị bỏ ra: vừa thêm (< 30 phút), chưa xác thực, chưa đăng bán → coi là sửa nhầm, xóa hẳn;
    // còn lại → "đã thay ra" (bán được).
    const gone = existing.filter((p) => !used.has(p.id));
    if (gone.length) {
      const listed = new Set((await t.selectFrom("listings").select("machine_part_id").where("machine_part_id", "in", gone.map((p) => p.id)).execute()).map((l) => l.machine_part_id));
      // Mẫu thay thế (chọn khi quét thấy CPU / card chưa có trong danh mục) không phải linh kiện thật → cũng xóa hẳn
      const substitute = (p: (typeof gone)[number]) => !!(p.details as { substituteFor?: string } | null)?.substituteFor;
      const typo = gone.filter((p) => !p.verified_at && !listed.has(p.id) && (substitute(p) || Date.now() - new Date(p.added_at).getTime() < CORRECTION_MS)).map((p) => p.id);
      const replaced = gone.filter((p) => !typo.includes(p.id)).map((p) => p.id);
      if (typo.length) await t.deleteFrom("machine_parts").where("id", "in", typo).execute();
      if (replaced.length) await t.updateTable("machine_parts").set({ status: "replaced", replaced_at: new Date() }).where("id", "in", replaced).execute();
    }

    await upsertScores(t, id, cfg);
    return id;
  });
}

async function upsertScores(db: DB, machineId: string, cfg: MachineConfig) {
  const s = computeScores(cfg);
  const row = {
    gaming: Math.round(s.gaming), render: Math.round(s.render), ai: Math.round(s.ai), office: Math.round(s.office),
    power: Math.round(s.power), tier: tierOf(s.power).code, badges: badgesFor(cfg, s).map((b) => b.code),
  };
  await db.insertInto("machine_scores").values({ machine_id: machineId, scale_version: SCALE_VERSION, ...row })
    .onConflict((oc) => oc.columns(["machine_id", "scale_version"]).doUpdateSet({ ...row, computed_at: sql`now()` })).execute();
}

export async function setPrimary(db: DB, userId: string, machineId: string) {
  const own = await db.selectFrom("machines").select("id").where("id", "=", machineId).where("owner_id", "=", userId).executeTakeFirst();
  if (!own) throw new MachineError(404, "Không tìm thấy máy");
  await db.transaction().execute(async (tx) => {
    await tx.updateTable("machines").set({ is_primary: false }).where("owner_id", "=", userId).execute();
    await tx.updateTable("machines").set({ is_primary: true }).where("id", "=", machineId).execute();
  });
}

/** Xóa máy phụ (máy chính không xóa được khi còn máy khác; tin đang bán từ máy này bị ẩn) */
export async function deleteMachine(db: DB, userId: string, machineId: string) {
  const ms = await db.selectFrom("machines").select(["id", "is_primary"]).where("owner_id", "=", userId).execute();
  const m = ms.find((x) => x.id === machineId);
  if (!m) throw new MachineError(404, "Không tìm thấy máy");
  if (m.is_primary && ms.length > 1) throw new MachineError(409, "Đặt máy khác làm máy chính trước khi xóa máy này.");
  await db.transaction().execute(async (tx) => {
    const t = tx as unknown as DB;
    const partIds = (await t.selectFrom("machine_parts").select("id").where("machine_id", "=", machineId).execute()).map((p) => p.id);
    if (partIds.length) await t.updateTable("listings").set({ status: "hidden", machine_part_id: null }).where("machine_part_id", "in", partIds).execute();
    await t.deleteFrom("machines").where("id", "=", machineId).execute();
  });
}

/** Máy chính dạng tóm tắt (API cũ /v1/me/machine) */
export async function loadPrimaryMachine(db: DB, userId: string): Promise<MachineInput | null> {
  const ms = await loadMachines(db, userId);
  return ms.find((m) => m.isPrimary)?.input ?? null;
}

/**
 * Lưu máy chính từ dạng tóm tắt (API cũ). Giữ chi tiết đã khai nếu phần tóm tắt tương ứng không đổi.
 */
export async function savePrimaryMachine(db: DB, userId: string, cfg: MachineConfig) {
  const ms = await loadMachines(db, userId);
  const primary = ms.find((m) => m.isPrimary);
  const input: MachineInput = { cpu: cfg.cpu.name, gpu: cfg.gpu.name, ramGb: cfg.ramGb, ramChannels: cfg.ramChannels, storage: cfg.storage, pcieGen: cfg.pcieGen, psuW: cfg.psuW, resolution: cfg.resolution };
  const fresh = specFromInput(input);
  let spec = fresh;
  if (primary) {
    const old = primary.spec, oi = primary.input;
    spec = {
      cpu: input.cpu, gpu: input.gpu, resolution: input.resolution,
      mainboard: { ...old.mainboard, pcieGen: input.pcieGen },
      ram: oi.ramGb === input.ramGb && oi.ramChannels === input.ramChannels ? old.ram : fresh.ram,
      drives: oi.storage === input.storage ? old.drives : fresh.drives,
      psu: old.psu.wattage === input.psuW ? old.psu : { ...old.psu, wattage: input.psuW },
    };
  }
  return saveSpec(db, userId, primary?.id ?? null, spec);
}

/** Bảng xếp hạng: máy chính của mọi người, theo điểm sức mạnh ở thang hiện tại */
export async function leaderboard(db: DB, limit = 100) {
  const rows = await db.selectFrom("machines as m")
    .innerJoin("users as u", "u.id", "m.owner_id")
    .innerJoin("machine_scores as s", (j) => j.onRef("s.machine_id", "=", "m.id").on("s.scale_version", "=", SCALE_VERSION))
    .select(["u.id as userId", "u.handle", "u.display_name", "u.province", "m.id as machineId", "m.ram_gb", "m.resolution", "s.power", "s.tier"])
    .where("m.is_primary", "=", true).where("u.banned_at", "is", null).orderBy("s.power", "desc").limit(limit).execute();
  const parts = rows.length === 0 ? [] : await db.selectFrom("machine_parts")
    .select(["machine_id", "kind", "label", "verified_at"]).where("status", "=", "in_use").where("kind", "in", ["cpu", "gpu"])
    .where("machine_id", "in", rows.map((r) => r.machineId)).execute();
  return rows.map((r, i) => {
    const mine = parts.filter((p) => p.machine_id === r.machineId);
    return {
      rank: i + 1, userId: r.userId, handle: r.handle, displayName: r.display_name, province: r.province,
      cpu: mine.find((p) => p.kind === "cpu")?.label ?? null, gpu: mine.find((p) => p.kind === "gpu")?.label ?? null,
      ramGb: r.ram_gb, resolution: r.resolution, power: r.power, tier: r.tier,
      verified: mine.length === 2 && mine.every((p) => p.verified_at),
    };
  });
}

/**
 * Máy chính của một người trên bảng xếp hạng (xem công khai): cấu hình chi tiết + linh kiện nào đã xác thực.
 * Chỉ đọc, không lộ id linh kiện / tin rao.
 */
export async function publicMachine(db: DB, userId: string) {
  const row = await db.selectFrom("machines as m").innerJoin("users as u", "u.id", "m.owner_id")
    .select([...machineCols.map((c) => `m.${c}` as const), "u.handle", "u.display_name", "u.province"])
    .where("m.owner_id", "=", userId).where("m.is_primary", "=", true).where("u.banned_at", "is", null).executeTakeFirst();
  if (!row) return null;
  const m = row as unknown as MachineRow;
  const parts = await partsOf(db, m.id);
  const built = buildSpec(m, parts);
  if (!built) return null;
  return {
    userId, handle: row.handle, displayName: row.display_name, province: row.province,
    spec: built.spec, lastScanAt: m.last_scan_at, bench: benchOf(m, built.spec),
    parts: parts.filter((p) => p.status === "in_use" || p.status === "for_sale").map((p) => ({
      kind: p.kind, label: p.label, verified: !!p.verified_at && p.status === "in_use",
    })),
  };
}

/** Xóa linh kiện đã thay ra khỏi kho (khai nhầm, đã vứt, đã cho…). Không xóa linh kiện đang lắp / đang có tin bán. */
export async function deleteStoredPart(db: DB, userId: string, partId: string) {
  const p = await db.selectFrom("machine_parts as mp").innerJoin("machines as m", "m.id", "mp.machine_id")
    .select(["mp.id", "mp.status"]).where("mp.id", "=", partId).where("m.owner_id", "=", userId).executeTakeFirst();
  if (!p) throw new MachineError(404, "Không tìm thấy linh kiện");
  if (p.status !== "replaced") throw new MachineError(409, p.status === "in_use" ? "Linh kiện đang lắp trong máy: bỏ nó ra ở phần cấu hình." : "Linh kiện đang có tin bán: ẩn hoặc đánh dấu đã bán trước.");
  await db.transaction().execute(async (tx) => {
    await tx.updateTable("listings").set({ machine_part_id: null }).where("machine_part_id", "=", partId).execute();
    await tx.deleteFrom("machine_parts").where("id", "=", partId).execute();
  });
}
