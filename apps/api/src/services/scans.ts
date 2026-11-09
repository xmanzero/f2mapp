import { randomInt } from "node:crypto";
import {
  findCpu, findGpu, interpretScan, MAX_MACHINES, specFromScan, VERIFIABLE_KINDS, type MachineSpec, type PartKind, type ScanReport, type ScanResult,
} from "@f2m/shared";
import { sql } from "kysely";
import QRCode from "qrcode";
import type { DB } from "../db.js";
import { loadMachines, MachineError, saveSpec } from "./machines.js";

export const SCAN_TTL_MS = 30 * 60_000;
/** Bỏ chữ dễ nhầm (0/O, 1/I/L) để đọc mã qua điện thoại cho dễ */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
/** Người dùng gõ tay: bỏ gạch, khoảng trắng, chữ thường */
export const normCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const prettyCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;

/** Ma trận QR (1 = ô đen) để phần mềm tự vẽ, khỏi kèm thư viện tạo QR */
export function qrMatrix(text: string) {
  const q = QRCode.create(text, { errorCorrectionLevel: "M" });
  let bits = "";
  for (let i = 0; i < q.modules.size * q.modules.size; i++) bits += q.modules.data[i] ? "1" : "0";
  return { size: q.modules.size, bits };
}

export async function createScan(db: DB, report: ScanReport) {
  const result = interpretScan(report);
  const expires = new Date(Date.now() + SCAN_TTL_MS);
  // dọn mã hết hạn chưa dùng (rẻ, có index)
  await db.deleteFrom("scans").where("expires_at", "<", new Date(Date.now() - 86_400_000)).where("claimed_at", "is", null).execute();
  for (let i = 0; ; i++) {
    const code = newCode();
    const ok = await db.insertInto("scans").values({ code, report: JSON.stringify(report), result: JSON.stringify(result), expires_at: expires })
      .onConflict((oc) => oc.column("code").doNothing()).returning("id").executeTakeFirst();
    if (ok) return { code, result, expiresAt: expires };
    if (i > 5) throw new Error("Không tạo được mã quét");
  }
}

/** Xem kết quả quét theo mã (ai có mã cũng xem được — chỉ có thông tin phần cứng) */
export async function getScan(db: DB, rawCode: string) {
  const row = await db.selectFrom("scans as s").leftJoin("users as u", "u.id", "s.claimed_by").leftJoin("machines as m", "m.id", "s.claimed_machine")
    .select(["s.code", "s.result", "s.created_at", "s.expires_at", "s.claimed_at", "u.handle", "m.name as machine_name"])
    .where("s.code", "=", normCode(rawCode)).executeTakeFirst();
  if (!row) return null;
  return {
    code: row.code, result: row.result as ScanResult, createdAt: row.created_at, expiresAt: row.expires_at,
    expired: !row.claimed_at && row.expires_at.getTime() < Date.now(),
    claimed: row.claimed_at ? { at: row.claimed_at, handle: row.handle, machineName: row.machine_name } : null,
  };
}

export interface ClaimInput {
  /** null = tạo máy mới */
  machineId: string | null;
  /** Bắt buộc khi bản quét chưa nhận ra CPU / card (chọn từ danh mục) */
  cpu?: string;
  gpu?: string;
  /** Nguồn (phần mềm không đọc được): máy mới thì khai, cập nhật máy thì giữ nguồn cũ nếu bỏ trống */
  psuW?: number;
  name?: string;
}

/**
 * Gắn bản quét vào tài khoản: cập nhật một máy đang có hoặc tạo máy mới (tối đa 2 máy).
 * Linh kiện đọc được từ máy (và CPU / card khớp danh mục) thành "Xác thực đang dùng".
 */
export async function claimScan(db: DB, userId: string, rawCode: string, input: ClaimInput) {
  const code = normCode(rawCode);
  const scan = await db.selectFrom("scans").select(["result", "expires_at", "claimed_at"]).where("code", "=", code).executeTakeFirst();
  if (!scan) throw new MachineError(404, "Không tìm thấy mã quét. Kiểm tra lại mã trên phần mềm.");
  if (scan.claimed_at) throw new MachineError(409, "Mã này đã được dùng. Quét lại trên máy để lấy mã mới.");
  if (scan.expires_at.getTime() < Date.now()) throw new MachineError(410, "Mã đã hết hạn (30 phút). Quét lại trên máy để lấy mã mới.");
  const result = scan.result as ScanResult;

  const cpu = result.cpu.name ?? input.cpu;
  const gpu = result.gpu.name ?? input.gpu;
  if (!cpu || !findCpu(cpu)) throw new MachineError(400, "Chọn CPU gần đúng nhất trong danh mục.");
  if (!gpu || !findGpu(gpu)) throw new MachineError(400, "Chọn card đồ họa gần đúng nhất trong danh mục.");

  const machines = await loadMachines(db, userId);
  let psu: MachineSpec["psu"];
  let name = input.name?.trim().slice(0, 40) || undefined;
  if (input.machineId) {
    const m = machines.find((x) => x.id === input.machineId);
    if (!m) throw new MachineError(404, "Không tìm thấy máy");
    psu = input.psuW ? { wattage: input.psuW, model: null, rating: null } : m.spec.psu;
  } else {
    if (machines.length >= MAX_MACHINES) throw new MachineError(409, `Bạn đã có ${MAX_MACHINES} máy. Xóa bớt một máy rồi tạo máy mới, hoặc chọn cập nhật máy đang có.`);
    const rec = findGpu(gpu)?.psuRecommendedW ?? 550;
    psu = { wattage: input.psuW ?? Math.max(450, Math.ceil(rec / 50) * 50), model: null, rating: null };
    name ??= machines.length === 0 ? "Máy của tôi" : "Máy thứ hai";
  }

  // Giữ mã trước (một lần dùng): hai thiết bị cùng bấm thì chỉ một bên thành công
  const lock = await db.updateTable("scans").set({ claimed_at: new Date(), claimed_by: userId }).where("code", "=", code).where("claimed_at", "is", null)
    .returning("id").executeTakeFirst();
  if (!lock) throw new MachineError(409, "Mã này đã được dùng. Quét lại trên máy để lấy mã mới.");
  try {
    const spec = specFromScan(result, { cpu, gpu, psu });
    const machineId = await saveSpec(db, userId, input.machineId, spec, name, { loose: true });
    // Đánh dấu xác thực: các loại linh kiện phần mềm đọc thật được trong lần quét này
    const seen = new Set<PartKind>(VERIFIABLE_KINDS.filter((k) =>
      k === "cpu" ? !!result.cpu.name : k === "gpu" ? !!result.gpu.name : k === "ram" ? result.ram.length > 0 : k === "storage" ? result.drives.length > 0 : !!(result.mainboard.model || result.mainboard.chipset)));
    const now = new Date();
    if (seen.size) await db.updateTable("machine_parts").set({ verified_at: now })
      .where("machine_id", "=", machineId).where("status", "=", "in_use").where("kind", "in", [...seen]).execute();
    // CPU / card người dùng tự chọn thay cho mẫu chưa có trong danh mục: không tính là đã xác thực,
    // ghi lại tên thật để lần sau (danh mục đã có mẫu đúng) mẫu thay thế bị xóa hẳn chứ không thành "đã thay ra"
    const unseen = VERIFIABLE_KINDS.filter((k) => !seen.has(k));
    if (unseen.length) await db.updateTable("machine_parts").set({ verified_at: null })
      .where("machine_id", "=", machineId).where("status", "=", "in_use").where("kind", "in", unseen).execute();
    for (const [kind, m] of [["cpu", result.cpu], ["gpu", result.gpu]] as const)
      if (!m.name) await db.updateTable("machine_parts").set({ details: JSON.stringify({ substituteFor: m.raw }) })
        .where("machine_id", "=", machineId).where("status", "=", "in_use").where("kind", "=", kind).execute();
    // có đo hiệu năng trong lần quét này → thay số đo cũ; không đo thì giữ số đo cũ (chỉ hiện khi vẫn đúng CPU / card)
    const bench = result.bench ? JSON.stringify({ ...result.bench, at: now.toISOString() }) : undefined;
    await db.updateTable("machines").set({ last_scan_at: now, updated_at: sql`now()`, ...(bench ? { bench } : {}) }).where("id", "=", machineId).execute();
    await db.updateTable("scans").set({ claimed_machine: machineId }).where("code", "=", code).execute();
    return machineId;
  } catch (e) {
    await db.updateTable("scans").set({ claimed_at: null, claimed_by: null }).where("code", "=", code).execute();
    throw e;
  }
}
