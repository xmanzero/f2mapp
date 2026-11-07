"use client";

import {
  computeScores, CPUS, estimateFps, evaluate, GPUS, hardwareFindings, psuNeeded, resolveMachine, RESOLUTION_LABEL, SOCKET_MEMORY, suggestUpgrades, TIERS,
  type Finding, type MachineConfig, type MachineInput, type Resolution, type Severity, type UpgradeSuggestion,
} from "@f2m/shared";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SAMPLE_MACHINES } from "@/data/sample";
import { n0, ratio, RES_LABEL, signedPct, STORAGE_LABEL } from "@/lib/format";
import { useMachine } from "@/lib/use-machine";

const toInput = (c: MachineConfig): MachineInput => ({
  cpu: c.cpu.name, gpu: c.gpu.name, ramGb: c.ramGb, ramChannels: c.ramChannels, storage: c.storage,
  pcieGen: c.pcieGen, psuW: c.psuW, resolution: c.resolution,
});
const SEV_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2, ok: 3 };
const sevClass = (s: Severity) => (s === "critical" ? "neg" : s === "warning" ? "warn" : s === "ok" ? "pos" : "");
const PSU_OPTIONS = [300, 400, 450, 500, 550, 600, 650, 750, 850, 1000, 1200];

export function MyMachine() {
  const { machine, save, isSample, ready, savedTo, saveState } = useMachine();
  const [preview, setPreview] = useState<UpgradeSuggestion | null>(null);
  const shown = preview ? toInput(preview.next) : machine;

  const view = useMemo(() => {
    if (!ready) return null;
    const cfg = resolveMachine(shown);
    const base = resolveMachine(machine);
    return { cfg, r: evaluate(cfg, new Date().getFullYear()), base: evaluate(base).scores.power, upgrades: suggestUpgrades(base) };
  }, [ready, shown, machine]);

  if (!view) return <Loading />;
  const { cfg, r, upgrades } = view;
  const findings = [...r.findings].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  const lead = findings[0]!;

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Máy của tôi</h1>
          <p className="sub">{lead.message}</p>
        </div>
        <span className="stamp" role="status">
          {isSample ? "Đang là máy mẫu: sửa cấu hình để thành máy của bạn"
            : savedTo === "account" ? (saveState === "saving" ? "Đang lưu…" : saveState === "error" ? "Chưa lưu được. Kiểm tra mạng rồi sửa lại." : "Đã lưu vào tài khoản")
            : <>Lưu trên trình duyệt này · <Link href="/dang-nhap" className="card-link">Đăng nhập để lưu vào tài khoản</Link></>}
        </span>
      </div>

      {preview && (
        <div className="preview-bar" role="status">
          <p>
            Đang xem thử <b>{preview.title.replace(/^Lên /, "")}</b>: điểm {n0(view.base)} → {n0(r.scores.power)} ({signedPct(preview.powerGain)}),
            game {RESOLUTION_LABEL[cfg.resolution]} ~{preview.fpsBefore} → ~{preview.fpsAfter} FPS.
          </p>
          <button className="btn small primary" onClick={() => { save(toInput(preview.next)); setPreview(null); }}>Lắp vào máy tôi</button>
          <button className="btn small" onClick={() => setPreview(null)}>Bỏ xem thử</button>
        </div>
      )}

      <div className="grid">
        <ScoreCard r={r} />
        <ConfigCard cfg={cfg} locked={!!preview} onChange={(next) => save(next)} />
        <OsdCard cfg={cfg} bottlenecks={r.bottlenecks} />
        <NeedsCard needs={r.needs} />
        <UpgradesCard items={upgrades} active={preview} onPreview={setPreview} />
        <FindingsCard findings={hardwareFindings(cfg)} cfg={cfg} />
      </div>
    </>
  );
}

function Loading() {
  return (
    <>
      <div className="title-row"><div><h1>Máy của tôi</h1><p className="sub">Đang tải cấu hình…</p></div></div>
      <div className="grid">
        <section className="panel s5" aria-busy="true"><div className="skeleton" style={{ width: 140, height: 38 }} /><div className="skeleton" style={{ marginTop: 92, height: 70 }} /></section>
        <section className="panel s7" aria-busy="true"><div className="skeleton" style={{ height: 230 }} /></section>
      </div>
    </>
  );
}

type Result = ReturnType<typeof evaluate>;

function TierProgress({ power }: { power: number }) {
  const i = TIERS.findIndex((t) => t.min > power);
  if (i === -1) return <p className="muted" style={{ marginTop: 16 }}>Đang ở hạng cao nhất.</p>;
  const from = TIERS[i - 1]!, to = TIERS[i]!;
  const pct = ((power - from.min) / (to.min - from.min)) * 100;
  return (
    <div style={{ marginTop: 16 }}>
      <p>Còn <b className="num">{n0(to.min - power)}</b> điểm lên {to.name}</p>
      <div className="tier-track" role="img" aria-label={`Đã đi được ${Math.round(pct)}% từ ${from.name} lên ${to.name}`}>
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="tier-ends faint num"><span>{from.name} {n0(from.min)}</span><span>{to.name} {n0(to.min)}</span></div>
    </div>
  );
}

/** Vị trí của máy này trên bảng xếp hạng (hiện là dữ liệu mẫu) */
function RankLine({ power }: { power: number }) {
  const others = SAMPLE_MACHINES.map((m) => computeScores(resolveMachine(m.machine)).power);
  const rank = others.filter((p) => p > power).length + 1;
  return (
    <p className="rank-line">
      <span>Đứng thứ <b className="num">{rank}</b> trên <span className="num">{others.length + 1}</span> máy</span>
      <Link href="/xep-hang" className="card-link">Bảng xếp hạng</Link>
    </p>
  );
}

function ScoreCard({ r }: { r: Result }) {
  const s = r.scores;
  return (
    <section className="panel s5" aria-labelledby="h-score">
      <header>
        <h2 id="h-score">Điểm sức mạnh</h2>
        <span className="meta">Gaming 50% · Đồ họa 30% · AI 20%</span>
      </header>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className="answer num">{n0(s.power)}</span>
        <span className="pill">Hạng {r.tier.name}</span>
      </div>
      <p className="muted" style={{ marginTop: 6 }}>Gấp <span className="num">{ratio(s.power / 10000)}</span> lần máy mốc (i5-12400F + RTX 3060 = 10.000)</p>
      <TierProgress power={s.power} />
      <RankLine power={s.power} />

      {r.badges.length > 0 && (
        <ul className="rows" style={{ marginTop: 10 }} aria-label="Huy hiệu">
          {r.badges.map((b) => (
            <li key={b.code} className="row" style={{ minHeight: 40, padding: "8px 0" }}>
              <span className="pill pos">{b.name}</span>
              <span className="faint" style={{ fontSize: 12 }}>{b.description}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="strip well">
        {([["gaming", "Gaming"], ["render", "Đồ họa"], ["ai", "AI"]] as const).map(([k, l]) => (
          <div key={k}>
            <div className="label">{l}</div>
            <div className="value num">{n0(s[k])}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Select({ label, value, onChange, children, disabled }: {
  label: string; value: string | number; onChange: (v: string) => void; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <span className="select-wrap">
      <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>{children}</select>
      <ChevronDown aria-hidden="true" />
    </span>
  );
}

function ConfigCard({ cfg, onChange, locked }: { cfg: MachineConfig; onChange: (m: MachineInput) => void; locked: boolean }) {
  const input = toInput(cfg);
  const set = <K extends keyof MachineInput>(k: K, v: MachineInput[K]) => onChange({ ...input, [k]: v });
  const sockets = [...new Set(CPUS.map((c) => c.socket))];
  const gpuGroups: [string, (g: (typeof GPUS)[number]) => boolean][] = [
    ["NVIDIA", (g) => /^(RTX|GTX)/.test(g.name)], ["AMD", (g) => g.name.startsWith("RX")],
    ["Intel", (g) => g.name.startsWith("Arc")], ["Khác", (g) => g.integrated],
  ];
  const rows: [string, React.ReactNode, string?][] = [
    ["CPU", <Select key="cpu" label="CPU" value={input.cpu} disabled={locked} onChange={(v) => set("cpu", v)}>
      {sockets.map((s) => <optgroup key={s} label={`${s} · ${SOCKET_MEMORY[s]}`}>{CPUS.filter((c) => c.socket === s).map((c) => <option key={c.name}>{c.name}</option>)}</optgroup>)}
    </Select>, `${cfg.cpu.socket} · ${cfg.cpu.powerW} W`],
    ["Card đồ họa", <Select key="gpu" label="Card đồ họa" value={input.gpu} disabled={locked} onChange={(v) => set("gpu", v)}>
      {gpuGroups.map(([g, f]) => <optgroup key={g} label={g}>{GPUS.filter(f).map((x) => <option key={x.name}>{x.name}</option>)}</optgroup>)}
    </Select>, cfg.gpu.integrated ? "Dùng chung RAM" : `${cfg.gpu.vramGb} GB · PCIe x${cfg.gpu.pcieLanes} · ${cfg.gpu.boardPowerW} W`],
    ["RAM", <span key="ram" style={{ display: "inline-flex" }}>
      <Select label="Dung lượng RAM" value={input.ramGb} disabled={locked} onChange={(v) => set("ramGb", Number(v) as MachineInput["ramGb"])}>
        {[8, 16, 32, 64, 128].map((g) => <option key={g} value={g}>{g} GB</option>)}
      </Select>
      <Select label="Kênh RAM" value={input.ramChannels} disabled={locked} onChange={(v) => set("ramChannels", Number(v) as 1 | 2)}>
        <option value={2}>kênh đôi</option><option value={1}>kênh đơn</option>
      </Select>
    </span>],
    ["Ổ hệ điều hành", <Select key="ssd" label="Ổ hệ điều hành" value={input.storage} disabled={locked} onChange={(v) => set("storage", v as MachineInput["storage"])}>
      {Object.entries(STORAGE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </Select>],
    ["Khe card trên mainboard", <Select key="pcie" label="Khe PCIe" value={input.pcieGen} disabled={locked} onChange={(v) => set("pcieGen", Number(v) as 3 | 4 | 5)}>
      {[3, 4, 5].map((g) => <option key={g} value={g}>PCIe {g}.0</option>)}
    </Select>],
    ["Nguồn", <Select key="psu" label="Nguồn" value={input.psuW} disabled={locked} onChange={(v) => set("psuW", Number(v))}>
      {PSU_OPTIONS.map((w) => <option key={w} value={w}>{w} W</option>)}
    </Select>, `Cần từ ${psuNeeded(cfg)} W`],
    ["Màn hình", <Select key="res" label="Màn hình" value={input.resolution} disabled={locked} onChange={(v) => set("resolution", Number(v) as Resolution)}>
      {([1080, 1440, 2160] as const).map((r) => <option key={r} value={r}>{RES_LABEL[r]}</option>)}
    </Select>],
  ];
  return (
    <section className="panel s7" aria-labelledby="h-config">
      <header>
        <h2 id="h-config">Cấu hình</h2>
        <span className="meta">{locked ? "Bỏ xem thử để sửa" : "Bấm vào giá trị để đổi"}</span>
      </header>
      <dl className="rows">
        {rows.map(([label, control, sub]) => (
          <div key={label} className="row" style={{ padding: "3px 0", minHeight: 42 }}>
            <dt className="grow">
              <span className="muted">{label}</span>
              {sub && <div className="line2">{sub}</div>}
            </dt>
            <dd className="end" style={{ marginRight: -12 }}>{control}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function OsdCard({ cfg, bottlenecks }: { cfg: MachineConfig; bottlenecks: Result["bottlenecks"] }) {
  const max = Math.max(...bottlenecks.flatMap((b) => [b.gpuFps, b.cpuFps])) * 1.08;
  return (
    <section className="panel s7" aria-labelledby="h-osd">
      <header>
        <h2 id="h-osd">Khung hình theo màn hình</h2>
        <span className="meta">Game AAA mới, thiết lập Ultra</span>
      </header>
      <div className="osd">
        {bottlenecks.map((b) => {
          const cur = b.resolution === cfg.resolution;
          const [sideText, sideCls] = b.loss <= 0.1 ? ["Cân bằng", "pos"]
            : b.side === "cpu" ? [`CPU nghẽn ${Math.round(b.loss * 100)}%`, "warn"]
            : ["Card chạy hết", ""];
          const side = <span className={`pill ${sideCls}`}>{sideText}</span>;
          return (
            <div key={b.resolution} className={`osd-row${cur ? " current" : ""}`}>
              <div className="res">{RESOLUTION_LABEL[b.resolution]}<small>{cur ? "màn hình của bạn" : sideText}</small></div>
              <div className="osd-track" role="img"
                aria-label={`${RESOLUTION_LABEL[b.resolution]}: card làm được ${Math.round(b.gpuFps)} FPS, CPU nuôi được ${Math.round(b.cpuFps)} FPS`}>
                <div className="osd-gpu" style={{ width: `${(Math.min(b.gpuFps, b.cpuFps) / max) * 100}%` }} />
                <div className="osd-cpu" style={{ left: `${(b.cpuFps / max) * 100}%` }} />
              </div>
              <div className="osd-fps">
                <b className="num">{Math.round(b.fps)}</b> <small>FPS</small>
                {cur && <div style={{ marginTop: 4 }}>{side}</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="osd-legend">
        <span><i aria-hidden="true" /> FPS thực tế (card hoặc CPU, bên nào thấp hơn)</span>
        <span><i className="cpu" aria-hidden="true" /> Mức CPU nuôi được: {Math.round(bottlenecks[0]!.cpuFps)} FPS</span>
      </div>
      <TargetLine cfg={cfg} />
    </section>
  );
}

/** Mục tiêu tiếp theo: độ phân giải cao hơn (hoặc hiện tại nếu chưa tới 60 FPS) cần card nào để đạt 60 FPS */
function TargetLine({ cfg }: { cfg: MachineConfig }) {
  const order: Resolution[] = [1080, 1440, 2160];
  const res = estimateFps(cfg) < 60 ? cfg.resolution : order[order.indexOf(cfg.resolution) + 1];
  if (!res) return null;
  const pick = GPUS.filter((g) => !g.integrated)
    .map((gpu) => ({ gpu, fps: estimateFps({ ...cfg, gpu, resolution: res }) }))
    .filter((x) => x.fps >= 60).sort((a, b) => a.gpu.raster - b.gpu.raster)[0];
  return (
    <p className="target">
      {pick ? <>Muốn chơi <b>{RESOLUTION_LABEL[res]}</b> trên 60 FPS với CPU hiện tại: card yếu nhất đạt là <b>{pick.gpu.name}</b> (~{Math.round(pick.fps)} FPS).</>
        : <>Với CPU hiện tại, chưa card nào đạt 60 FPS ở {RESOLUTION_LABEL[res]}: cần nâng CPU trước.</>}
    </p>
  );
}

function NeedsCard({ needs }: { needs: Result["needs"] }) {
  const cls = (l: number) => (l >= 4 ? "pos" : l === 1 ? "neg" : l === 2 ? "warn" : "");
  return (
    <section className="panel s5" aria-labelledby="h-needs">
      <header><h2 id="h-needs">Đáp ứng nhu cầu</h2></header>
      <ul className="rows">
        {needs.map((n) => (
          <li key={n.need} className="row" style={{ alignItems: "flex-start" }}>
            <div className="grow">
              <div style={{ fontWeight: 500 }}>{n.label}</div>
              <div className="line2">{n.detail}</div>
            </div>
            <span className={`pill ${cls(n.level)}`}>{n.levelLabel}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function UpgradesCard({ items, active, onPreview }: { items: UpgradeSuggestion[]; active: UpgradeSuggestion | null; onPreview: (s: UpgradeSuggestion | null) => void }) {
  return (
    <section className="panel s7" aria-labelledby="h-up">
      <header>
        <h2 id="h-up">Gợi ý nâng cấp</h2>
        <span className="meta">Chưa tính giá · xếp theo việc nên làm trước</span>
      </header>
      {items.length === 0 ? (
        <p className="empty">Máy đã ở mức đầu bảng cho màn hình này. Không có linh kiện nào tăng FPS từ 40% trở lên.</p>
      ) : (
        <ul className="rows">
          {items.map((s) => {
            const on = active?.title === s.title;
            return (
              <li key={s.title} className="row upgrade-row">
                <div className="grow">
                  <div style={{ fontWeight: 500 }}>{s.title}</div>
                  <div className="line2">{s.reason}{s.warnings.length > 0 && <> {s.warnings.map((w) => w.message).join(" ")}</>}</div>
                </div>
                <div className="end gain">
                  <div className={`num ${s.powerGain > 0.005 ? "" : "faint"}`} style={{ fontWeight: 600, color: s.powerGain > 0.005 ? "var(--positive)" : undefined }}>
                    {signedPct(s.powerGain)} điểm
                  </div>
                  <div className="line2 num">{s.fpsBefore} → {s.fpsAfter} FPS</div>
                </div>
                <button className="btn small" aria-pressed={on} onClick={() => onPreview(on ? null : s)}>{on ? "Đang xem" : "Xem thử"}</button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FindingsCard({ findings, cfg }: { findings: Finding[]; cfg: MachineConfig }) {
  return (
    <section className="panel s5" aria-labelledby="h-find">
      <header><h2 id="h-find">Kiểm tra phần cứng</h2></header>
      {findings.length === 0 ? (
        <p className="empty">Không có cảnh báo. Nguồn đủ {cfg.psuW} W, RAM kênh {cfg.ramChannels === 2 ? "đôi" : "đơn"}, khe PCIe {cfg.pcieGen}.0 không làm card chậm.</p>
      ) : (
        <ul className="rows">
          {findings.map((f) => (
            <li key={f.code} className="row" style={{ alignItems: "flex-start" }}>
              <span className={`dot ${sevClass(f.severity)}`} style={{ marginTop: 6 }} aria-hidden="true" />
              <p className="grow">{f.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
