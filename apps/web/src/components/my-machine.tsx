"use client";

import {
  computeScores, estimateFps, evaluate, GPUS, hardwareFindings, resolveMachine, RESOLUTION_LABEL, specFindings, specToInput, suggestUpgrades, TIERS,
  type Finding, type MachineConfig, type MachineSpec, type Resolution, type Severity, type UpgradeSuggestion,
} from "@f2m/shared";
import { Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SAMPLE_MACHINES } from "@/data/sample";
import { api } from "@/lib/api";
import type { SellablePart } from "@/lib/listings";
import { n0, ratio, signedPct } from "@/lib/format";
import { useMachine, type PartView } from "@/lib/use-machine";
import { MachineDiagram } from "./machine-diagram";
import { TierEmblem, tierVars } from "./tier";
import { ConfigEditor } from "./config-editor";

const SEV_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2, ok: 3 };
const sevClass = (s: Severity) => (s === "critical" ? "neg" : s === "warning" ? "warn" : s === "ok" ? "pos" : "");
const KIND_VI: Record<string, string> = { cpu: "CPU", gpu: "card đồ họa", mainboard: "mainboard", ram: "RAM", storage: "ổ cứng", psu: "nguồn" };

/** Áp gợi ý nâng cấp (dạng tóm tắt) vào cấu hình chi tiết */
function applySuggestion(spec: MachineSpec, next: MachineConfig): MachineSpec {
  const cur = specToInput(spec);
  const out: MachineSpec = { ...spec, cpu: next.cpu.name, gpu: next.gpu.name, psu: { ...spec.psu, wattage: next.psuW } };
  if (next.ramGb !== cur.ramGb || next.ramChannels !== cur.ramChannels) {
    const sticks = next.ramChannels === 2 ? 2 : 1;
    out.ram = [{ ...spec.ram[0]!, sticks, perStickGb: Math.max(2, Math.round(next.ramGb / sticks)), model: null }];
  }
  if (next.storage !== cur.storage) out.drives = spec.drives.map((d) => (d.isBoot ? { ...d, interface: next.storage, model: null, healthPct: null } : d));
  return out;
}

export function MyMachine() {
  const m = useMachine();
  const { spec, save, isSample, ready, savedTo, saveState, user, machines, active } = m;
  const [preview, setPreview] = useState<UpgradeSuggestion | null>(null);
  const shownSpec = preview ? applySuggestion(spec, preview.next) : spec;

  const view = useMemo(() => {
    if (!ready) return null;
    const cfg = resolveMachine(specToInput(shownSpec));
    const base = resolveMachine(specToInput(spec));
    return { cfg, r: evaluate(cfg, new Date().getFullYear()), base: evaluate(base).scores.power, upgrades: suggestUpgrades(base) };
  }, [ready, shownSpec, spec]);

  useEffect(() => { setPreview(null); }, [active.id]);
  if (!view) return <Loading />;
  const { cfg, r, upgrades } = view;
  const findings = [...specFindings(shownSpec), ...r.findings].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  const lead = findings[0]!;

  return (
    <>
      <div className="title-row">
        <div>
          <h1>{machines.length > 1 ? active.name : "Máy của tôi"}</h1>
          <p className="sub">{active.missing.length > 0
            ? `Bạn đã bán ${active.missing.map((k) => KIND_VI[k]).join(", ")} của máy này. Chọn linh kiện thay thế ở phần cấu hình.`
            : lead.message}</p>
        </div>
        <span className="stamp" role="status">
          {isSample ? "Đang là máy mẫu: sửa cấu hình để thành máy của bạn"
            : savedTo === "account" ? (saveState === "saving" ? "Đang lưu…" : saveState === "error" ? (m.error ?? "Chưa lưu được. Kiểm tra mạng rồi sửa lại.") : "Đã lưu vào tài khoản")
            : <>Lưu trên trình duyệt này · <Link href="/dang-nhap" className="card-link">Đăng nhập để lưu vào tài khoản</Link></>}
        </span>
      </div>

      {user && machines[0]?.id && <MachineTabs m={m} />}
      <ReplacedNotice saveState={saveState} />

      {preview && (
        <div className="preview-bar" role="status">
          <p>
            Đang xem thử <b>{preview.title.replace(/^Lên /, "")}</b>: điểm {n0(view.base)} → {n0(r.scores.power)} ({signedPct(preview.powerGain)}),
            game {RESOLUTION_LABEL[cfg.resolution]} ~{preview.fpsBefore} → ~{preview.fpsAfter} FPS.
          </p>
          <button className="btn small primary" onClick={() => { save(applySuggestion(spec, preview.next)); setPreview(null); }}>Lắp vào máy tôi</button>
          <button className="btn small" onClick={() => setPreview(null)}>Bỏ xem thử</button>
        </div>
      )}

      <div className="grid split">
        <div className="col col-l">
          <ScoreCard r={r} verified={active.verified} isAccount={!!active.id} spec={shownSpec} parts={active.parts} />
          <OsdCard cfg={cfg} bottlenecks={r.bottlenecks} />
          <NeedsCard needs={r.needs} />
          <UpgradesCard items={upgrades} active={preview} onPreview={setPreview} />
        </div>
        <div className="col col-r">
          <section className="panel" aria-labelledby="h-config">
            <header>
              <h2 id="h-config">Cấu hình</h2>
              <span className="meta">{preview ? "Bỏ xem thử để sửa" : "Bấm vào giá trị để đổi"}</span>
            </header>
            <ConfigEditor spec={shownSpec} parts={active.parts} locked={!!preview} canSell={!!user && !!active.id} onChange={save} />
          </section>
          <FindingsCard findings={[...specFindings(shownSpec), ...hardwareFindings(cfg)]} cfg={cfg} />
        </div>
      </div>
    </>
  );
}

/** Chuyển giữa 2 máy, thêm máy, đặt máy chính, đổi tên, xóa máy phụ */
function MachineTabs({ m }: { m: ReturnType<typeof useMachine> }) {
  const [naming, setNaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canManage = m.machines.length > 1 && !m.active.isPrimary && !!m.active.id;
  return (
    <div className="machine-tabs">
      {m.machines.length > 1 && (
        <div className="segmented" role="group" aria-label="Chọn máy">
          {m.machines.map((x) => (
            <button key={x.id} aria-pressed={x.id === m.active.id} onClick={() => m.setActiveId(x.id)}>
              {x.isPrimary && <Star size={13} aria-label="Máy chính" style={{ marginRight: 6, verticalAlign: -1 }} />}{x.name}
            </button>
          ))}
        </div>
      )}
      {naming !== null ? (
        <form style={{ display: "flex", gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (naming.trim()) void m.rename(naming.trim()); setNaming(null); }}>
          <input className="mini-input" style={{ border: "1px solid var(--control)" }} aria-label="Tên máy" value={naming} maxLength={40} autoFocus onChange={(e) => setNaming(e.target.value)} />
          <button className="btn small primary">Lưu tên</button>
          <button type="button" className="btn small" onClick={() => setNaming(null)}>Hủy</button>
        </form>
      ) : (
        <button className="btn small" onClick={() => setNaming(m.active.name)}>Đổi tên máy</button>
      )}
      {canManage && <button className="btn small" onClick={() => void m.setPrimary(m.active.id!)}>Đặt làm máy chính</button>}
      {canManage && (confirmDelete ? (
        <>
          <span className="stamp">Xóa “{m.active.name}”? Tin đang bán từ máy này sẽ bị ẩn.</span>
          <button className="btn small" style={{ color: "var(--negative)" }} onClick={() => { void m.removeMachine(m.active.id!); setConfirmDelete(false); }}>Xóa máy</button>
          <button className="btn small" onClick={() => setConfirmDelete(false)}>Giữ lại</button>
        </>
      ) : <button className="btn small" onClick={() => setConfirmDelete(true)}>Xóa máy này</button>)}
      {m.canAdd && <button className="btn small" onClick={() => void m.addMachine("Máy 2")}>Thêm máy thứ hai</button>}
      {m.error && <span className="stamp" role="alert" style={{ color: "var(--negative)" }}>{m.error}</span>}
    </div>
  );
}

/** Linh kiện đã thay ra, chưa đăng bán → nhắc đăng bán */
function ReplacedNotice({ saveState }: { saveState: string }) {
  const { user } = useMachine();
  const [parts, setParts] = useState<SellablePart[]>([]);
  useEffect(() => {
    if (!user || saveState === "saving") return;
    api<{ parts: SellablePart[] }>("/v1/me/listings").then((r) => setParts(r.parts.filter((p) => !p.inUse && !p.listingId))).catch(() => {});
  }, [user, saveState]);
  if (parts.length === 0) return null;
  const first = parts[0]!;
  return (
    <div className="sell-bar" role="status">
      <p>Bạn đã thay ra <b>{first.label}</b>{parts.length > 1 ? ` và ${parts.length - 1} linh kiện khác` : ""}. Đăng bán để có thêm tiền nâng cấp.</p>
      <Link href={`/cho/dang-tin?mp=${first.id}`} className="btn small primary">Đăng bán</Link>
      {parts.length > 1 && <Link href="/cho/cua-toi" className="btn small">Xem tất cả</Link>}
    </div>
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
      <div className="tier-track tier-fill" role="img" aria-label={`Đã đi được ${Math.round(pct)}% từ ${from.name} lên ${to.name}`}>
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

function ScoreCard({ r, verified, isAccount, spec, parts }: { r: Result; verified: boolean; isAccount: boolean; spec: MachineSpec; parts: PartView[] }) {
  const s = r.scores;
  return (
    <section className="panel score-card" style={tierVars(r.tier.code)} aria-labelledby="h-score">
      <header>
        <h2 id="h-score">Điểm sức mạnh</h2>
        <span className="meta">Gaming 50% · Đồ họa 30% · AI 20%</span>
      </header>
      <div className="score-body">
        <div className="score-main">
          <div className="score-head">
            <TierEmblem code={r.tier.code} label={r.tier.name} />
            <div>
              <span className="answer num tier-ink">{n0(s.power)}</span>
              <div className="tier-name">Hạng {r.tier.name}</div>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 10 }}>Gấp <span className="num">{ratio(s.power / 10000)}</span> lần máy mốc (i5-12400F + RTX 3060)</p>
          {isAccount && (
            <p style={{ marginTop: 8 }}>
              <span className={`pill ${verified ? "pos" : ""}`} title={verified ? "Phần mềm benchmark đã quét và xác nhận các linh kiện đang dùng" : "Cấu hình tự khai, chưa chạy phần mềm benchmark"}>
                {verified ? "Xác thực đang dùng" : "Chưa xác thực"}
              </span>
            </p>
          )}
          <TierProgress power={s.power} />
          <RankLine power={s.power} />
        </div>
        <figure className="score-figure">
          <MachineDiagram spec={spec} parts={parts} />
          <figcaption className="faint">Sơ đồ máy{isAccount ? " · viền xanh = xác thực đang dùng" : ""}</figcaption>
        </figure>
      </div>

      {r.badges.length > 0 && (
        <ul className="badges" aria-label="Huy hiệu">
          {r.badges.map((b) => (
            <li key={b.code} title={b.description}><span className="pill pos">{b.name}</span><span className="faint">{b.description}</span></li>
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
