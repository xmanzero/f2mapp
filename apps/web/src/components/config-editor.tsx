"use client";

import {
  CPUS, GPUS, psuNeeded, resolveMachine, SOCKET_MEMORY, specToInput,
  type Drive, type MachineSpec, type PartKind, type RamKit,
} from "@f2m/shared";
import { ChevronDown, Plus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { RES_LABEL, STORAGE_LABEL } from "@/lib/format";
import type { PartView } from "@/lib/use-machine";

const PSU_OPTIONS = [300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 850, 1000, 1200, 1300, 1600];
const PER_STICK = [2, 4, 8, 12, 16, 24, 32, 48, 64];
const CAPACITIES = [120, 128, 240, 250, 256, 480, 500, 512, 960, 1000, 2000, 4000, 8000];
const RATINGS = ["", "80 Plus", "80 Plus Bronze", "80 Plus Silver", "80 Plus Gold", "80 Plus Platinum", "80 Plus Titanium"];
const capLabel = (gb: number) => (gb >= 1000 ? `${gb / 1000} TB` : `${gb} GB`);

function Select({ label, value, onChange, children, disabled, wide }: {
  label: string; value: string | number; onChange: (v: string) => void; children: ReactNode; disabled?: boolean; wide?: boolean;
}) {
  return (
    <span className={`select-wrap${wide ? " wide" : ""}`}>
      <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>{children}</select>
      <ChevronDown aria-hidden="true" />
    </span>
  );
}

/** Ô chữ: chỉ lưu khi rời ô hoặc bấm Enter (gõ dở không bị coi là thay linh kiện) */
function TextField({ label, value, onCommit, placeholder, disabled, numeric, width }: {
  label: string; value: string; onCommit: (v: string) => void; placeholder?: string; disabled?: boolean; numeric?: boolean; width?: number;
}) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  const commit = () => { if (v.trim() !== value) onCommit(v.trim()); };
  return (
    <input className="mini-input" aria-label={label} value={v} placeholder={placeholder} disabled={disabled}
      inputMode={numeric ? "numeric" : undefined} style={width ? { width } : undefined}
      onChange={(e) => setV(numeric ? e.target.value.replace(/\D/g, "") : e.target.value)}
      onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
  );
}

function PartStatus({ part, canSell }: { part?: PartView; canSell: boolean }) {
  // máy chưa lưu vào tài khoản (khách): chưa có gì để xác thực hay bán
  if (!part || !part.id) return null;
  const real = (part.details as { substituteFor?: string } | null | undefined)?.substituteFor;
  if (real)
    return (
      <span className="part-status">
        <span className="pill warn" title={`Máy quét thấy ${real}, chưa có trong danh mục điểm nên tạm tính theo mẫu gần nhất. Khi danh mục có mẫu này, quét lại để xác thực.`}>
          Mẫu gần đúng
        </span>
      </span>
    );
  return (
    <span className="part-status">
      <span className={`pill ${part.verified ? "pos" : ""}`} title={part.verified ? "Phần mềm f2m-scan đã quét thấy linh kiện này đang dùng trong máy" : "Tự khai, chưa quét bằng phần mềm f2m-scan để xác nhận"}>
        {part.verified ? "Xác thực đang dùng" : "Chưa xác thực"}
      </span>
      {canSell && part.id && (part.listingId
        ? <Link href={`/cho/tin?id=${part.listingId}`} className="card-link">Đang bán</Link>
        : <Link href={`/cho/dang-tin?mp=${part.id}`} className="card-link">Bán</Link>)}
    </span>
  );
}

function Section({ title, sub, part, canSell, children, action }: {
  title: string; sub?: string; part?: PartView; canSell: boolean; children: ReactNode; action?: ReactNode;
}) {
  return (
    <div className="cfg-row">
      <div className="cfg-head">
        <div><span className="cfg-title">{title}</span>{sub && <span className="cfg-sub">{sub}</span>}</div>
        <div className="cfg-meta">{action}<PartStatus part={part} canSell={canSell} /></div>
      </div>
      <div className="cfg-fields">{children}</div>
    </div>
  );
}

export function ConfigEditor({ spec, parts, onChange, locked, canSell }: {
  spec: MachineSpec; parts: PartView[]; onChange: (s: MachineSpec) => void; locked: boolean; canSell: boolean;
}) {
  const cfg = resolveMachine(specToInput(spec));
  const set = (patch: Partial<MachineSpec>) => onChange({ ...spec, ...patch });
  const inUse = (kind: PartKind) => parts.filter((p) => p.kind === kind && p.status === "in_use");
  const setRam = (i: number, patch: Partial<RamKit>) => set({ ram: spec.ram.map((k, j) => (j === i ? { ...k, ...patch } : k)) });
  const setDrive = (i: number, patch: Partial<Drive>) =>
    set({ drives: spec.drives.map((d, j) => (j === i ? { ...d, ...patch } : patch.isBoot ? { ...d, isBoot: false } : d)) });
  const sockets = [...new Set(CPUS.map((c) => c.socket))];
  const gpuGroups: [string, (g: (typeof GPUS)[number]) => boolean][] = [
    ["NVIDIA", (g) => /^(RTX|GTX)/.test(g.name)], ["AMD", (g) => g.name.startsWith("RX")],
    ["Intel", (g) => g.name.startsWith("Arc")], ["Khác", (g) => g.integrated],
  ];
  const ramType = SOCKET_MEMORY[cfg.cpu.socket];

  return (
    <div className="cfg">
      <Section title="CPU" sub={`${cfg.cpu.socket} · ${ramType} · ${cfg.cpu.powerW} W`} part={inUse("cpu")[0]} canSell={canSell}>
        <Select label="CPU" value={spec.cpu} disabled={locked} wide onChange={(v) => set({ cpu: v })}>
          {sockets.map((s) => <optgroup key={s} label={`${s} · ${SOCKET_MEMORY[s]}`}>{CPUS.filter((c) => c.socket === s).map((c) => <option key={c.name}>{c.name}</option>)}</optgroup>)}
        </Select>
      </Section>

      <Section title="Card đồ họa" sub={cfg.gpu.integrated ? "Dùng chung RAM" : `${cfg.gpu.vramGb} GB · PCIe x${cfg.gpu.pcieLanes} · ${cfg.gpu.boardPowerW} W`} part={inUse("gpu")[0]} canSell={canSell}>
        <Select label="Card đồ họa" value={spec.gpu} disabled={locked} wide onChange={(v) => set({ gpu: v })}>
          {gpuGroups.map(([g, f]) => <optgroup key={g} label={g}>{GPUS.filter(f).map((x) => <option key={x.name}>{x.name}</option>)}</optgroup>)}
        </Select>
      </Section>

      <Section title="Mainboard" sub="f2m-scan đọc được hãng, model, chipset" part={inUse("mainboard")[0]} canSell={canSell}>
        <TextField label="Model mainboard" value={spec.mainboard.model ?? ""} placeholder="VD: MSI PRO B660M-A" disabled={locked}
          onCommit={(v) => set({ mainboard: { ...spec.mainboard, model: v || null } })} />
        <TextField label="Chipset" value={spec.mainboard.chipset ?? ""} placeholder="B660" disabled={locked} width={88}
          onCommit={(v) => set({ mainboard: { ...spec.mainboard, chipset: v.toUpperCase() || null } })} />
        <Select label="Khe card đồ họa" value={spec.mainboard.pcieGen} disabled={locked} onChange={(v) => set({ mainboard: { ...spec.mainboard, pcieGen: Number(v) as 3 | 4 | 5 } })}>
          {[3, 4, 5].map((g) => <option key={g} value={g}>Khe PCIe {g}.0</option>)}
        </Select>
      </Section>

      {spec.ram.map((k, i) => (
        <Section key={`ram${i}`} title={spec.ram.length > 1 ? `RAM ${i + 1}` : "RAM"} part={inUse("ram")[i]} canSell={canSell}
          sub={`Máy này dùng ${ramType}`}
          action={spec.ram.length > 1 && !locked && <button type="button" className="icon-btn" aria-label={`Bỏ bộ RAM ${i + 1}`} onClick={() => set({ ram: spec.ram.filter((_, j) => j !== i) })}><X aria-hidden="true" /></button>}>
          <Select label="Số thanh" value={k.sticks} disabled={locked} onChange={(v) => setRam(i, { sticks: Number(v) })}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} thanh</option>)}
          </Select>
          <Select label="Dung lượng mỗi thanh" value={k.perStickGb} disabled={locked} onChange={(v) => setRam(i, { perStickGb: Number(v) })}>
            {PER_STICK.map((n) => <option key={n} value={n}>× {n} GB</option>)}
          </Select>
          <Select label="Loại RAM" value={k.type} disabled={locked} onChange={(v) => setRam(i, { type: v as RamKit["type"] })}>
            {["DDR3", "DDR4", "DDR5"].map((t) => <option key={t}>{t}</option>)}
          </Select>
          <TextField label="Tốc độ (MHz)" value={k.speedMhz ? String(k.speedMhz) : ""} placeholder="MHz" numeric width={76} disabled={locked}
            onCommit={(v) => setRam(i, { speedMhz: v ? Math.min(12000, Math.max(800, Number(v))) : null })} />
          <Select label="ECC" value={k.registered ? "rdimm" : k.ecc ? "ecc" : "none"} disabled={locked}
            onChange={(v) => setRam(i, { ecc: v !== "none", registered: v === "rdimm" })}>
            <option value="none">Không ECC</option><option value="ecc">ECC</option><option value="rdimm">ECC RDIMM</option>
          </Select>
          <Select label="Kiểu thanh" value={k.formFactor} disabled={locked} onChange={(v) => setRam(i, { formFactor: v as RamKit["formFactor"] })}>
            <option value="dimm">DIMM (máy bàn)</option><option value="sodimm">SO-DIMM (laptop)</option>
          </Select>
          <TextField label="Model RAM" value={k.model ?? ""} placeholder="Model (không bắt buộc)" disabled={locked} onCommit={(v) => setRam(i, { model: v || null })} />
        </Section>
      ))}
      {!locked && spec.ram.length < 4 && (
        <button type="button" className="add-btn" onClick={() => set({ ram: [...spec.ram, { sticks: 2, perStickGb: 8, type: ramType === "DDR5" ? "DDR5" : "DDR4", speedMhz: null, model: null, formFactor: "dimm", ecc: false, registered: false }] })}>
          <Plus aria-hidden="true" /> Thêm bộ RAM
        </button>
      )}

      {spec.drives.map((d, i) => (
        <Section key={`drive${i}`} title={spec.drives.length > 1 ? `Ổ cứng ${i + 1}` : "Ổ cứng"} part={inUse("storage")[i]} canSell={canSell}
          sub={d.isBoot ? "Ổ chứa hệ điều hành" : undefined}
          action={spec.drives.length > 1 && !locked && <button type="button" className="icon-btn" aria-label={`Bỏ ổ cứng ${i + 1}`}
            onClick={() => { const rest = spec.drives.filter((_, j) => j !== i); set({ drives: d.isBoot ? rest.map((x, j) => ({ ...x, isBoot: j === 0 })) : rest }); }}><X aria-hidden="true" /></button>}>
          <Select label="Loại ổ" value={d.interface} disabled={locked} onChange={(v) => setDrive(i, { interface: v as Drive["interface"] })}>
            {Object.entries(STORAGE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Select label="Dung lượng" value={d.capacityGb} disabled={locked} onChange={(v) => setDrive(i, { capacityGb: Number(v) })}>
            {[...new Set([...CAPACITIES, d.capacityGb])].sort((a, b) => a - b).map((c) => <option key={c} value={c}>{capLabel(c)}</option>)}
          </Select>
          <TextField label="Model ổ cứng" value={d.model ?? ""} placeholder="Model (không bắt buộc)" disabled={locked} onCommit={(v) => setDrive(i, { model: v || null })} />
          <TextField label="Sức khỏe (%)" value={d.healthPct === null ? "" : String(d.healthPct)} placeholder="Sức khỏe %" numeric width={124} disabled={locked}
            onCommit={(v) => setDrive(i, { healthPct: v ? Math.min(100, Number(v)) : null })} />
          {!d.isBoot && !locked && <button type="button" className="link small" onClick={() => setDrive(i, { isBoot: true })}>Đặt làm ổ hệ điều hành</button>}
        </Section>
      ))}
      {!locked && spec.drives.length < 8 && (
        <button type="button" className="add-btn" onClick={() => set({ drives: [...spec.drives, { interface: "sata", capacityGb: 1000, model: null, healthPct: null, isBoot: false }] })}>
          <Plus aria-hidden="true" /> Thêm ổ cứng
        </button>
      )}

      <Section title="Nguồn" sub={`Cần từ ${psuNeeded(cfg)} W · f2m-scan không đọc được nguồn`} part={inUse("psu")[0]} canSell={canSell}>
        <Select label="Công suất nguồn" value={spec.psu.wattage} disabled={locked} onChange={(v) => set({ psu: { ...spec.psu, wattage: Number(v) } })}>
          {[...new Set([...PSU_OPTIONS, spec.psu.wattage])].sort((a, b) => a - b).map((w) => <option key={w} value={w}>{w} W</option>)}
        </Select>
        <Select label="Chuẩn 80 Plus" value={spec.psu.rating ?? ""} disabled={locked} onChange={(v) => set({ psu: { ...spec.psu, rating: v || null } })}>
          {RATINGS.map((r) => <option key={r} value={r}>{r || "Không rõ chuẩn"}</option>)}
        </Select>
        <TextField label="Model nguồn" value={spec.psu.model ?? ""} placeholder="Model (không bắt buộc)" disabled={locked}
          onCommit={(v) => set({ psu: { ...spec.psu, model: v || null } })} />
      </Section>

      <Section title="Màn hình" canSell={false}>
        <Select label="Màn hình" value={spec.resolution} disabled={locked} onChange={(v) => set({ resolution: Number(v) as MachineSpec["resolution"] })}>
          {([1080, 1440, 2160] as const).map((r) => <option key={r} value={r}>{RES_LABEL[r]}</option>)}
        </Select>
      </Section>
    </div>
  );
}
