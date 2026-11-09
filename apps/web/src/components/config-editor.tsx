"use client";

import { useI18n } from "@/i18n/client";

import {
  CPUS, GPUS, isLaptop, psuNeeded, resolveMachine, SOCKET_MEMORY, specToInput,
  type Drive, type MachineSpec, type PartKind, type RamKit,
} from "@f2m/shared";
import { ChevronDown, Plus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
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
      inputMode={numeric ? "numeric" : undefined}
      // giãn theo nội dung (tên model dài như "ASUS TUF GAMING B660M-PLUS D4"), không vượt khung
      style={{ width: `max(${width ?? 220}px, calc(${Math.max(v.length, placeholder?.length ?? 0)}ch + 28px))` }}
      onChange={(e) => setV(numeric ? e.target.value.replace(/\D/g, "") : e.target.value)}
      onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
  );
}

function PartStatus({ part, canSell }: { part?: PartView; canSell: boolean }) {
  const { t, p } = useI18n();
  // máy chưa lưu vào tài khoản (khách): chưa có gì để xác thực hay bán
  if (!part || !part.id) return null;
  const real = (part.details as { substituteFor?: string } | null | undefined)?.substituteFor;
  if (real)
    return (
      <span className="part-status">
        <span className="pill warn" title={t.cfg.approxTip(real)}>
          {t.cfg.approxModel}
        </span>
      </span>
    );
  return (
    <span className="part-status">
      <span className={`pill ${part.verified ? "pos" : ""}`} title={part.verified ? t.cfg.verifiedTip : t.cfg.unverifiedTip}>
        {part.verified ? t.machine.verified : t.machine.unverified}
      </span>
      {canSell && part.id && (part.listingId
        ? <Link href={`${p("/cho/tin")}?id=${part.listingId}`} className="card-link">{t.cfg.selling}</Link>
        : <Link href={`${p("/cho/dang-tin")}?mp=${part.id}`} className="card-link">{t.cfg.sell}</Link>)}
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

/** typeSwitch: cho đổi loại máy ngay trong cấu hình (máy trên trình duyệt của khách). Máy trên tài khoản đổi bằng tab ở đầu trang. */
export function ConfigEditor({ spec, parts, onChange, locked, canSell, typeSwitch = true }: {
  spec: MachineSpec; parts: PartView[]; onChange: (s: MachineSpec) => void; locked: boolean; canSell: boolean; typeSwitch?: boolean;
}) {
  const cfg = resolveMachine(specToInput(spec));
  const { t } = useI18n();
  const T = t.cfg;
  const set = (patch: Partial<MachineSpec>) => onChange({ ...spec, ...patch });
  const inUse = (kind: PartKind) => parts.filter((p) => p.kind === kind && p.status === "in_use");
  const setRam = (i: number, patch: Partial<RamKit>) => set({ ram: spec.ram.map((k, j) => (j === i ? { ...k, ...patch } : k)) });
  const setDrive = (i: number, patch: Partial<Drive>) =>
    set({ drives: spec.drives.map((d, j) => (j === i ? { ...d, ...patch } : patch.isBoot ? { ...d, isBoot: false } : d)) });
  // laptop: chỉ CPU / card laptop và đồ họa tích hợp; máy bàn: không có bản laptop
  const laptop = isLaptop(spec);
  const cpuList = CPUS.filter((c) => !!c.mobile === laptop || c.name === spec.cpu);
  const gpuList = GPUS.filter((g) => (laptop ? g.mobile || g.integrated : !g.mobile) || g.name === spec.gpu);
  const sockets = [...new Set(cpuList.map((c) => c.socket))];
  const cpuGroups: [string, (c: (typeof CPUS)[number]) => boolean][] = laptop
    ? [["Intel", (c) => c.name.startsWith("Core")], ["AMD", (c) => c.name.startsWith("Ryzen")]]
    : sockets.map((s) => [`${s} · ${SOCKET_MEMORY[s]}`, (c) => c.socket === s]);
  const gpuGroups: [string, (g: (typeof GPUS)[number]) => boolean][] = [
    ["NVIDIA", (g) => !g.integrated && /^(RTX|GTX)/.test(g.name)], ["AMD", (g) => !g.integrated && g.name.startsWith("RX")],
    ["Intel", (g) => !g.integrated && g.name.startsWith("Arc")], [T.other, (g) => g.integrated],
  ];
  const ramType = SOCKET_MEMORY[cfg.cpu.socket];
  const tgp = cfg.gpu.tgp;
  /** Đổi loại máy: giữ RAM / ổ / màn hình; CPU / card không hợp loại thì đổi sang mẫu gần sức nhất của loại kia */
  const switchType = (toLaptop: boolean) => {
    if (toLaptop === laptop) return;
    const near = <T extends { name: string }>(list: T[], score: (x: T) => number, cur: number) =>
      list.reduce((a, b) => (Math.abs(score(b) - cur) < Math.abs(score(a) - cur) ? b : a)).name;
    const cpus = CPUS.filter((c) => !!c.mobile === toLaptop), gpus = GPUS.filter((g) => (toLaptop ? g.mobile : !g.mobile && !g.integrated));
    const cpu = cpus.some((c) => c.name === spec.cpu) ? spec.cpu : near(cpus, (c) => c.gaming, cfg.cpu.gaming);
    const gpu = gpus.some((g) => g.name === spec.gpu) || cfg.gpu.integrated ? spec.gpu : near(gpus, (g) => g.raster, cfg.gpu.raster);
    onChange({
      ...spec, cpu, gpu, formFactor: toLaptop ? "laptop" : "desktop", gpuTgpW: null, laptopModel: toLaptop ? spec.laptopModel ?? null : null,
      ram: spec.ram.map((k) => ({ ...k, formFactor: toLaptop ? "sodimm" : "dimm" })),
    });
  };

  return (
    <div className="cfg">
      {(typeSwitch || laptop) && <Section title={typeSwitch ? T.machineType : T.laptopModel} sub={laptop ? T.laptopNote : undefined} canSell={false}>
        {typeSwitch && <div className="segmented" role="group" aria-label={T.machineType}>
          <button type="button" aria-pressed={!laptop} disabled={locked} onClick={() => switchType(false)}>{T.desktop}</button>
          <button type="button" aria-pressed={laptop} disabled={locked} onClick={() => switchType(true)}>{T.laptop}</button>
        </div>}
        {laptop && <TextField label={T.laptopModel} value={spec.laptopModel ?? ""} placeholder={T.laptopModelPh} disabled={locked}
          onCommit={(v) => set({ laptopModel: v || null })} />}
      </Section>}

      <Section title="CPU" sub={`${cfg.cpu.socket} · ${ramType} · ${cfg.cpu.powerW} W`} part={inUse("cpu")[0]} canSell={canSell}>
        <Select label="CPU" value={spec.cpu} disabled={locked} wide onChange={(v) => set({ cpu: v })}>
          {cpuGroups.map(([g, f]) => <optgroup key={g} label={g}>{cpuList.filter(f).map((c) => <option key={c.name}>{c.name}</option>)}</optgroup>)}
        </Select>
      </Section>

      <Section title={T.gpu} sub={cfg.gpu.integrated ? T.sharedRam : `${cfg.gpu.vramGb} GB · PCIe x${cfg.gpu.pcieLanes} · ${cfg.gpu.boardPowerW} W`} part={inUse("gpu")[0]} canSell={canSell}>
        <Select label={T.gpu} value={spec.gpu} disabled={locked} wide onChange={(v) => set({ gpu: v, gpuTgpW: null })}>
          {gpuGroups.map(([g, f]) => <optgroup key={g} label={g}>{gpuList.filter(f).map((x) => <option key={x.name}>{x.name}</option>)}</optgroup>)}
        </Select>
      </Section>

      {laptop && tgp && (
        <Section title={T.tgp} sub={T.tgpSub(tgp.min, tgp.max)} canSell={false}>
          <Select label={T.tgp} value={spec.gpuTgpW ?? tgp.default} disabled={locked} onChange={(v) => set({ gpuTgpW: Number(v) === tgp.default ? null : Number(v) })}>
            {[...new Set([...Array.from({ length: Math.floor((tgp.max - tgp.min) / 5) + 1 }, (_, i) => tgp.min + i * 5), tgp.max, tgp.default, spec.gpuTgpW ?? tgp.default])]
              .sort((a, b) => b - a).map((w) => <option key={w} value={w}>{w === tgp.default ? T.tgpDefault(w) : `${w} W`}</option>)}
          </Select>
        </Section>
      )}

      {!laptop && <Section title={t.listing.kind.mainboard} sub={T.mainboardSub} part={inUse("mainboard")[0]} canSell={canSell}>
        <TextField label={T.mbModel} value={spec.mainboard.model ?? ""} placeholder={T.mbModelPh} disabled={locked}
          onCommit={(v) => set({ mainboard: { ...spec.mainboard, model: v || null } })} />
        <TextField label="Chipset" value={spec.mainboard.chipset ?? ""} placeholder="B660" disabled={locked} width={88}
          onCommit={(v) => set({ mainboard: { ...spec.mainboard, chipset: v.toUpperCase() || null } })} />
        <Select label={T.gpuSlot} value={spec.mainboard.pcieGen} disabled={locked} onChange={(v) => set({ mainboard: { ...spec.mainboard, pcieGen: Number(v) as 3 | 4 | 5 } })}>
          {[3, 4, 5].map((g) => <option key={g} value={g}>{T.pcieSlot(g)}</option>)}
        </Select>
      </Section>}

      {spec.ram.map((k, i) => (
        <Section key={`ram${i}`} title={spec.ram.length > 1 ? T.ramN(i + 1) : "RAM"} part={inUse("ram")[i]} canSell={canSell}
          sub={T.usesRam(ramType)}
          action={spec.ram.length > 1 && !locked && <button type="button" className="icon-btn" aria-label={T.removeRam(i + 1)} onClick={() => set({ ram: spec.ram.filter((_, j) => j !== i) })}><X aria-hidden="true" /></button>}>
          <Select label={T.sticks} value={k.sticks} disabled={locked} onChange={(v) => setRam(i, { sticks: Number(v) })}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{T.nSticks(n)}</option>)}
          </Select>
          <Select label={T.perStick} value={k.perStickGb} disabled={locked} onChange={(v) => setRam(i, { perStickGb: Number(v) })}>
            {PER_STICK.map((n) => <option key={n} value={n}>× {n} GB</option>)}
          </Select>
          <Select label={T.ramType} value={k.type} disabled={locked} onChange={(v) => setRam(i, { type: v as RamKit["type"] })}>
            {["DDR3", "DDR4", "DDR5"].map((x) => <option key={x}>{x}</option>)}
          </Select>
          <TextField label={T.speed} value={k.speedMhz ? String(k.speedMhz) : ""} placeholder="MHz" numeric width={76} disabled={locked}
            onCommit={(v) => setRam(i, { speedMhz: v ? Math.min(12000, Math.max(800, Number(v))) : null })} />
          <Select label="ECC" value={k.registered ? "rdimm" : k.ecc ? "ecc" : "none"} disabled={locked}
            onChange={(v) => setRam(i, { ecc: v !== "none", registered: v === "rdimm" })}>
            <option value="none">{T.noEcc}</option><option value="ecc">ECC</option><option value="rdimm">ECC RDIMM</option>
          </Select>
          <Select label={T.formFactor} value={k.formFactor} disabled={locked} onChange={(v) => setRam(i, { formFactor: v as RamKit["formFactor"] })}>
            <option value="dimm">{T.dimm}</option><option value="sodimm">{T.sodimm}</option>
          </Select>
          <TextField label={T.ramModel} value={k.model ?? ""} placeholder={T.optionalModel} disabled={locked} onCommit={(v) => setRam(i, { model: v || null })} />
        </Section>
      ))}
      {!locked && spec.ram.length < 4 && (
        <button type="button" className="add-btn" onClick={() => set({ ram: [...spec.ram, { sticks: 2, perStickGb: 8, type: ramType === "DDR5" ? "DDR5" : "DDR4", speedMhz: null, model: null, formFactor: laptop ? "sodimm" : "dimm", ecc: false, registered: false }] })}>
          <Plus aria-hidden="true" /> {T.addRam}
        </button>
      )}

      {spec.drives.map((d, i) => (
        <Section key={`drive${i}`} title={spec.drives.length > 1 ? T.driveN(i + 1) : T.drive} part={inUse("storage")[i]} canSell={canSell}
          sub={d.isBoot ? T.bootDrive : undefined}
          action={spec.drives.length > 1 && !locked && <button type="button" className="icon-btn" aria-label={T.removeDrive(i + 1)}
            onClick={() => { const rest = spec.drives.filter((_, j) => j !== i); set({ drives: d.isBoot ? rest.map((x, j) => ({ ...x, isBoot: j === 0 })) : rest }); }}><X aria-hidden="true" /></button>}>
          <Select label={T.driveType} value={d.interface} disabled={locked} onChange={(v) => setDrive(i, { interface: v as Drive["interface"] })}>
            {Object.entries(T.storage).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Select label={T.capacity} value={d.capacityGb} disabled={locked} onChange={(v) => setDrive(i, { capacityGb: Number(v) })}>
            {[...new Set([...CAPACITIES, d.capacityGb])].sort((a, b) => a - b).map((c) => <option key={c} value={c}>{capLabel(c)}</option>)}
          </Select>
          <TextField label={T.driveModel} value={d.model ?? ""} placeholder={T.optionalModel} disabled={locked} onCommit={(v) => setDrive(i, { model: v || null })} />
          <TextField label={T.health} value={d.healthPct === null ? "" : String(d.healthPct)} placeholder={T.healthPh} numeric width={124} disabled={locked}
            onCommit={(v) => setDrive(i, { healthPct: v ? Math.min(100, Number(v)) : null })} />
          {!d.isBoot && !locked && <button type="button" className="link small" onClick={() => setDrive(i, { isBoot: true })}>{T.makeBoot}</button>}
        </Section>
      ))}
      {!locked && spec.drives.length < 8 && (
        <button type="button" className="add-btn" onClick={() => set({ drives: [...spec.drives, { interface: "sata", capacityGb: 1000, model: null, healthPct: null, isBoot: false }] })}>
          <Plus aria-hidden="true" /> {T.addDrive}
        </button>
      )}

      {!laptop && <Section title={T.psu} sub={T.psuSub(psuNeeded(cfg))} part={inUse("psu")[0]} canSell={canSell}>
        <Select label={T.psuWatt} value={spec.psu.wattage} disabled={locked} onChange={(v) => set({ psu: { ...spec.psu, wattage: Number(v) } })}>
          {[...new Set([...PSU_OPTIONS, spec.psu.wattage])].sort((a, b) => a - b).map((w) => <option key={w} value={w}>{w} W</option>)}
        </Select>
        <Select label={T.psuRating} value={spec.psu.rating ?? ""} disabled={locked} onChange={(v) => set({ psu: { ...spec.psu, rating: v || null } })}>
          {RATINGS.map((r) => <option key={r} value={r}>{r || T.unrated}</option>)}
        </Select>
        <TextField label={T.psuModel} value={spec.psu.model ?? ""} placeholder={T.optionalModel} disabled={locked}
          onCommit={(v) => set({ psu: { ...spec.psu, model: v || null } })} />
      </Section>}

      <Section title={T.screen} canSell={false}>
        <Select label={T.screen} value={spec.resolution} disabled={locked} onChange={(v) => set({ resolution: Number(v) as MachineSpec["resolution"] })}>
          {([1080, 1440, 2160] as const).map((r) => <option key={r} value={r}>{T.res[r]}</option>)}
        </Select>
      </Section>
    </div>
  );
}
