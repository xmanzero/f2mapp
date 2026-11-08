import { capacityLabel, type MachineSpec } from "@f2m/shared";
import type { PartView } from "@/lib/use-machine";

/**
 * Sơ đồ máy: bo mạch với CPU, các khe RAM (đúng số thanh), card đồ họa, ổ cứng, nguồn.
 * Linh kiện "xác thực đang dùng" có viền màu dữ liệu (Tech Blue); còn lại viền xám.
 */
export function MachineDiagram({ spec, parts }: { spec: MachineSpec; parts: PartView[] }) {
  const ok = (kind: PartView["kind"], i = 0) => parts.filter((p) => p.kind === kind && p.status === "in_use")[i]?.verified ?? false;
  const stroke = (v: boolean) => (v ? "var(--accent)" : "var(--control)");
  const sticks = spec.ram.flatMap((k, ki) => Array.from({ length: k.sticks }, () => ({ kit: ki, gb: k.perStickGb })));
  const slots = Math.max(4, Math.min(8, sticks.length));
  const nvme = spec.drives.filter((d) => d.interface.startsWith("nvme")).slice(0, 3);
  const sata = spec.drives.filter((d) => !d.interface.startsWith("nvme")).slice(0, 3);
  const gpuShort = spec.gpu.replace(/^(RTX|GTX|RX|Arc) /, "$1 ").replace(/ (\d+)GB$/, "");
  const cpuShort = spec.cpu.replace(/^(Core|Ryzen) /, "").replace(/^Ultra /, "U");
  const totalGb = sticks.reduce((n, s) => n + s.gb, 0);
  const summary = `Sơ đồ máy: CPU ${spec.cpu}, ${sticks.length} thanh RAM ${totalGb} GB, card ${spec.gpu}, ${spec.drives.length} ổ cứng, nguồn ${spec.psu.wattage} W`;

  return (
    <svg className="diagram" viewBox="0 0 300 220" role="img" aria-label={summary}>
      {/* bo mạch */}
      <rect x="8" y="8" width="196" height="204" rx="10" fill="var(--raised)" stroke="var(--border)" />
      <text x="20" y="26" className="dg-cap">{spec.mainboard.chipset ?? "Mainboard"}</text>

      {/* CPU */}
      <rect x="24" y="36" width="62" height="62" rx="6" fill="var(--surface)" stroke={stroke(ok("cpu"))} strokeWidth={ok("cpu") ? 2 : 1.25} />
      <rect x="36" y="48" width="38" height="38" rx="3" fill="none" stroke="var(--border)" />
      <text x="55" y="64" textAnchor="middle" className="dg-strong">CPU</text>
      <text x="55" y="79" textAnchor="middle" className="dg-small">{cpuShort.length > 10 ? cpuShort.slice(0, 10) : cpuShort}</text>

      {/* khe RAM */}
      {Array.from({ length: slots }, (_, i) => {
        const s = sticks[i];
        const x = 104 + i * (84 / slots);
        return <rect key={i} x={x} y="30" width={Math.max(5, 84 / slots - 4)} height="72" rx="2"
          fill={s ? "var(--text)" : "transparent"} opacity={s ? 0.85 : 1} stroke={s ? stroke(ok("ram", s.kit)) : "var(--control)"} strokeWidth={s && ok("ram", s.kit) ? 2 : 1} />;
      })}
      <text x="146" y="116" textAnchor="middle" className="dg-small">RAM {totalGb} GB</text>

      {/* card đồ họa: dài hơn bo mạch */}
      <rect x="18" y="128" width="268" height="34" rx="6" fill="var(--surface)" stroke={stroke(ok("gpu"))} strokeWidth={ok("gpu") ? 2 : 1.25} />
      {[0, 1, 2].map((i) => <circle key={i} cx={196 + i * 30} cy="145" r="11" fill="none" stroke="var(--border)" />)}
      <text x="30" y="150" className="dg-strong">{gpuShort}</text>

      {/* ổ NVMe trên bo */}
      {nvme.map((d, i) => (
        <g key={`n${i}`}>
          <rect x={24 + i * 58} y="176" width="52" height="12" rx="2" fill="var(--surface)" stroke={stroke(ok("storage", spec.drives.indexOf(d)))} />
          <text x={50 + i * 58} y="202" textAnchor="middle" className="dg-small">{capacityLabel(d.capacityGb)}</text>
        </g>
      ))}

      {/* ổ SATA / HDD và nguồn: ngoài bo */}
      {sata.map((d, i) => (
        <g key={`s${i}`}>
          <rect x="216" y={14 + i * 34} width="74" height="28" rx="4" fill="var(--surface)" stroke={stroke(ok("storage", spec.drives.indexOf(d)))} />
          <text x="253" y={32 + i * 34} textAnchor="middle" className="dg-small">{d.interface === "hdd" ? "HDD" : "SSD"} {capacityLabel(d.capacityGb)}</text>
        </g>
      ))}
      <rect x="216" y="172" width="74" height="40" rx="4" fill="var(--surface)" stroke="var(--control)" strokeDasharray="3 3" />
      <text x="253" y="190" textAnchor="middle" className="dg-strong">PSU</text>
      <text x="253" y="204" textAnchor="middle" className="dg-small">{spec.psu.wattage} W</text>
    </svg>
  );
}
