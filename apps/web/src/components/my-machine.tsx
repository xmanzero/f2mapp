"use client";

import {
  benchForSpec, computeScores, estimateFps, isLaptop, measuredRender, evaluate, GPUS, hardwareFindings, resolveMachine, RESOLUTION_LABEL, specFindings, specToInput, suggestUpgrades, TIERS, tierName, localizePartLabel,
  type Finding, type MachineConfig, type MachineSpec, type Resolution, type Severity, type UpgradeSuggestion,
} from "@f2m/shared";
import { Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SAMPLE_MACHINES } from "@/data/sample";
import { api } from "@/lib/api";
import type { SellablePart } from "@/lib/listings";
import { useMachine, type PartView } from "@/lib/use-machine";
import { MachineDiagram } from "./machine-diagram";
import { TierEmblem, tierVars } from "./tier";
import { ConfigEditor } from "./config-editor";
import { NewMachine } from "./new-machine";
import { ExportMachine } from "./export-machine";
import CountUp from "./CountUp";
import { useI18n } from "@/i18n/client";
import { machineName } from "@/lib/use-machine";
import { BenchCard } from "./bench-card";

const SEV_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2, ok: 3 };
const sevClass = (s: Severity) => (s === "critical" ? "neg" : s === "warning" ? "warn" : s === "ok" ? "pos" : "");

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
  const { t, p, n0, signedPct, locale } = useI18n();
  const T = t.machine;
  const m = useMachine();
  const { spec, save, isSample, ready, savedTo, saveState, user, machines, active } = m;
  const [preview, setPreview] = useState<UpgradeSuggestion | null>(null);
  const shownSpec = preview ? applySuggestion(spec, preview.next) : spec;

  const view = useMemo(() => {
    if (!ready) return null;
    // điểm render theo số đo đã xác minh của chính máy (chỉ khi còn đúng CPU / card đang xem)
    const measured = (s: MachineSpec) => measuredRender(benchForSpec(active.bench ?? null, s));
    const cfg = resolveMachine(specToInput(shownSpec), measured(shownSpec));
    const base = resolveMachine(specToInput(spec), measured(spec));
    return { cfg, r: evaluate(cfg, new Date().getFullYear(), locale), base: evaluate(base).scores.power, upgrades: suggestUpgrades(base, locale) };
  }, [ready, shownSpec, spec, locale, active.bench]);

  useEffect(() => { setPreview(null); }, [active.id]);
  if (!view) return <Loading />;
  if (m.empty || m.adding) return (
    <NewMachine first={m.empty} name={m.empty ? "Máy của tôi" : "Máy 2"} browserSpec={m.empty ? m.browserSpec : null}
      onCreated={m.created} onCancel={m.adding && !m.empty ? m.cancelAdding : undefined} />
  );
  const { cfg, r, upgrades } = view;
  const findings = [...specFindings(shownSpec, locale), ...r.findings].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  const lead = findings[0]!;

  return (
    <>
      <div className="title-row">
        <div>
          <h1>{machines.length > 1 ? machineName(active.name, locale) : T.defaultName}</h1>
          <p className="sub">{active.missing.length > 0
            ? T.soldParts(active.missing.map((k) => T.kind[k]).join(", "))
            : lead.message}</p>
        </div>
        <span className="stamp" role="status">
          {isSample ? T.sampleStamp
            : savedTo === "account" ? (saveState === "saving" ? t.common.saving : saveState === "error" ? (m.error ?? T.saveError) : T.savedAccount)
            : <>{T.savedBrowser} · <Link href={p("/dang-nhap")} className="card-link">{T.loginToSave}</Link></>}
        </span>
      </div>

      <div className="machine-actions">
        {user && machines[0]?.id && <MachineTabs m={m} />}
        <ExportMachine name={machines.length > 1 || active.id ? machineName(active.name, locale) : T.defaultName} spec={shownSpec} r={r}
          parts={active.parts} handle={user?.handle ?? null} account={!!active.id} />
      </div>
      {m.justScanned && (
        <div className="scan-done" role="status">
          <p>{T.scanned(machineName(active.name, locale))}</p>
          <button type="button" className="btn small" onClick={m.dismissScanned}>{T.gotIt}</button>
        </div>
      )}
      <ReplacedNotice saveState={saveState} />

      {preview && (
        <div className="preview-bar" role="status">
          <p>{T.previewing(T.previewTarget(preview.title), n0(view.base), n0(r.scores.power), signedPct(preview.powerGain), RESOLUTION_LABEL[cfg.resolution], preview.fpsBefore, preview.fpsAfter)}</p>
          <button className="btn small primary" onClick={() => { save(applySuggestion(spec, preview.next)); setPreview(null); }}>{T.applyPreview}</button>
          <button className="btn small" onClick={() => setPreview(null)}>{T.cancelPreview}</button>
        </div>
      )}

      <div className="grid split">
        <div className="col col-l">
          <ScoreCard r={r} verified={active.verified} isAccount={!!active.id} spec={shownSpec} parts={active.parts} />
          {active.bench && !preview && <BenchCard bench={active.bench} />}
          <OsdCard cfg={cfg} bottlenecks={r.bottlenecks} />
          <NeedsCard needs={r.needs} />
          <UpgradesCard items={upgrades} active={preview} onPreview={setPreview} laptop={cfg.laptop} />
        </div>
        <div className="col col-r">
          <section className="panel" aria-labelledby="h-config">
            <header>
              <h2 id="h-config">{T.config}</h2>
              <span className="meta">{preview ? T.configLocked : T.configHint}</span>
            </header>
            {!active.lastScanAt && (
              <p className="scan-cta">
                {T.scanCta(<a href="/tai/pcdex-scan.exe" download className="card-link">{T.downloadScan}</a>, <Link href={p("/quet")} className="card-link">{T.haveCode}</Link>)}
              </p>
            )}
            <ConfigEditor spec={shownSpec} parts={active.parts} locked={!!preview} canSell={!!user && !!active.id} onChange={save} />
          </section>
          <FindingsCard findings={[...specFindings(shownSpec, locale), ...hardwareFindings(cfg, locale)]} cfg={cfg} />
        </div>
      </div>
    </>
  );
}

/** Chuyển giữa 2 máy, thêm máy, đặt máy chính, đổi tên, xóa máy phụ */
function MachineTabs({ m }: { m: ReturnType<typeof useMachine> }) {
  const { t, locale } = useI18n();
  const T = t.machine;
  const [naming, setNaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canManage = m.machines.length > 1 && !m.active.isPrimary && !!m.active.id;
  return (
    <div className="machine-tabs">
      {m.machines.length > 1 && (
        <div className="segmented" role="group" aria-label={T.chooseMachine}>
          {m.machines.map((x) => (
            <button key={x.id} aria-pressed={x.id === m.active.id} onClick={() => m.setActiveId(x.id)}>
              {x.isPrimary && <Star size={13} aria-label={T.primary} style={{ marginRight: 6, verticalAlign: -1 }} />}{machineName(x.name, locale)}
            </button>
          ))}
        </div>
      )}
      {naming !== null ? (
        <form style={{ display: "flex", gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (naming.trim()) void m.rename(naming.trim()); setNaming(null); }}>
          <input className="mini-input" style={{ border: "1px solid var(--control)" }} aria-label={T.machineName} value={naming} maxLength={40} autoFocus onChange={(e) => setNaming(e.target.value)} />
          <button className="btn small primary">{T.saveName}</button>
          <button type="button" className="btn small" onClick={() => setNaming(null)}>{t.common.cancel}</button>
        </form>
      ) : (
        <button className="btn small" onClick={() => setNaming(machineName(m.active.name, locale))}>{T.rename}</button>
      )}
      {canManage && <button className="btn small" onClick={() => void m.setPrimary(m.active.id!)}>{T.makePrimary}</button>}
      {canManage && (confirmDelete ? (
        <>
          <span className="stamp">{T.confirmDelete(machineName(m.active.name, locale))}</span>
          <button className="btn small" style={{ color: "var(--negative)" }} onClick={() => { void m.removeMachine(m.active.id!); setConfirmDelete(false); }}>{T.deleteMachine}</button>
          <button className="btn small" onClick={() => setConfirmDelete(false)}>{T.keep}</button>
        </>
      ) : <button className="btn small" onClick={() => setConfirmDelete(true)}>{T.deleteThis}</button>)}
      {m.canAdd && <button className="btn small" onClick={m.startAdding}>{T.addSecond}</button>}
      {m.error && <span className="stamp" role="alert" style={{ color: "var(--negative)" }}>{m.error}</span>}
    </div>
  );
}

/** Linh kiện đã thay ra, chưa đăng bán → nhắc đăng bán */
function ReplacedNotice({ saveState }: { saveState: string }) {
  const { user } = useMachine();
  const { t, p, locale } = useI18n();
  const [parts, setParts] = useState<SellablePart[]>([]);
  useEffect(() => {
    if (!user || saveState === "saving") return;
    api<{ parts: SellablePart[] }>("/v1/me/listings").then((r) => setParts(r.parts.filter((p) => !p.inUse && !p.listingId))).catch(() => {});
  }, [user, saveState]);
  if (parts.length === 0) return null;
  const first = parts[0]!;
  return (
    <div className="sell-bar" role="status">
      <p>{t.machine.replaced(localizePartLabel(first.label, locale), parts.length - 1)}</p>
      <Link href={`${p("/cho/dang-tin")}?mp=${first.id}`} className="btn small primary">{t.machine.sell}</Link>
      {parts.length > 1 && <Link href={p("/cho/cua-toi")} className="btn small">{t.machine.seeAll}</Link>}
    </div>
  );
}

function Loading() {
  const { t } = useI18n();
  return (
    <>
      <div className="title-row"><div><h1>{t.machine.defaultName}</h1><p className="sub">{t.machine.loadingConfig}</p></div></div>
      <div className="grid">
        <section className="panel s5" aria-busy="true"><div className="skeleton" style={{ width: 140, height: 38 }} /><div className="skeleton" style={{ marginTop: 92, height: 70 }} /></section>
        <section className="panel s7" aria-busy="true"><div className="skeleton" style={{ height: 230 }} /></section>
      </div>
    </>
  );
}

type Result = ReturnType<typeof evaluate>;

function TierProgress({ power }: { power: number }) {
  const { t, n0, locale } = useI18n();
  const i = TIERS.findIndex((x) => x.min > power);
  if (i === -1) return <p className="muted" style={{ marginTop: 16 }}>{t.machine.topTier}</p>;
  const from = TIERS[i - 1]!, to = TIERS[i]!;
  const fromName = tierName(from, locale), toName = tierName(to, locale);
  const pct = ((power - from.min) / (to.min - from.min)) * 100;
  return (
    <div style={{ marginTop: 16 }}>
      <p>{t.machine.toNextTier(n0(to.min - power), toName)}</p>
      <div className="tier-track tier-fill" role="img" aria-label={t.machine.tierProgress(Math.round(pct), fromName, toName)}>
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="tier-ends faint num"><span>{fromName} {n0(from.min)}</span><span>{toName} {n0(to.min)}</span></div>
    </div>
  );
}

/** Vị trí của máy này trên bảng xếp hạng (hiện là dữ liệu mẫu) */
function RankLine({ power }: { power: number }) {
  const { t, p } = useI18n();
  const others = SAMPLE_MACHINES.map((m) => computeScores(resolveMachine(m.machine)).power);
  const rank = others.filter((p) => p > power).length + 1;
  return (
    <p className="rank-line">
      <span>{t.machine.rank(rank, others.length + 1)}</span>
      <Link href={p("/xep-hang")} className="card-link">{t.nav.board}</Link>
    </p>
  );
}

function ScoreCard({ r, verified, isAccount, spec, parts }: { r: Result; verified: boolean; isAccount: boolean; spec: MachineSpec; parts: PartView[] }) {
  const s = r.scores;
  const { t, n0, ratio, locale } = useI18n();
  const T = t.machine;
  const tier = tierName(r.tier, locale);
  return (
    <section className="panel score-card" style={tierVars(r.tier.code)} aria-labelledby="h-score">
      <header>
        <h2 id="h-score">{T.power}</h2>
        <span className="meta">{T.weights}</span>
      </header>
      <div className="score-body">
        <div className="score-main">
          <div className="score-head">
            <TierEmblem code={r.tier.code} label={tier} />
            <div>
              <CountUp to={Math.round(s.power)} decimals={0} separator={locale === "vi" ? "." : ","} duration={1.1} trigger="load" className="answer num tier-ink" />
              <div className="tier-name">{T.tier(tier)}</div>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 10 }}>{T.timesAnchor(ratio(s.power / 10000))}</p>
          {isAccount && (
            <p style={{ marginTop: 8 }}>
              <span className={`pill ${verified ? "pos" : ""}`} title={verified ? T.verifiedTip : T.unverifiedTip}>
                {verified ? T.verified : T.unverified}
              </span>
            </p>
          )}
          <TierProgress power={s.power} />
          {/* máy mẫu đều là máy bàn: laptop không so hạng với chúng (xem tab Laptop trên bảng xếp hạng) */}
          {!isLaptop(spec) && <RankLine power={s.power} />}
        </div>
        <figure className="score-figure">
          <MachineDiagram spec={spec} parts={parts} />
          <figcaption className="faint">{T.diagram}{isAccount ? T.diagramVerified : ""}</figcaption>
        </figure>
      </div>

      {r.badges.length > 0 && (
        <ul className="badges" aria-label={T.badges}>
          {r.badges.map((b) => (
            <li key={b.code} title={b.description}><span className="pill pos">{b.name}</span><span className="faint">{b.description}</span></li>
          ))}
        </ul>
      )}

      <div className="strip well">
        {([["gaming", T.gaming], ["render", T.render], ["ai", T.ai]] as const).map(([k, l]) => (
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
  const { t } = useI18n();
  const T = t.machine;
  const max = Math.max(...bottlenecks.flatMap((b) => [b.gpuFps, b.cpuFps])) * 1.08;
  return (
    <section className="panel s7" aria-labelledby="h-osd">
      <header>
        <h2 id="h-osd">{T.osd}</h2>
        <span className="meta">{T.osdMeta}</span>
      </header>
      <div className="osd">
        {bottlenecks.map((b) => {
          const cur = b.resolution === cfg.resolution;
          const [sideText, sideCls] = b.loss <= 0.1 ? [T.balanced, "pos"]
            : b.side === "cpu" ? [T.cpuBound(Math.round(b.loss * 100)), "warn"]
            : [T.gpuFull, ""];
          const side = <span className={`pill ${sideCls}`}>{sideText}</span>;
          return (
            <div key={b.resolution} className={`osd-row${cur ? " current" : ""}`}>
              <div className="res">{RESOLUTION_LABEL[b.resolution]}<small>{cur ? T.yourScreen : sideText}</small></div>
              <div className="osd-track" role="img"
                aria-label={T.osdAria(RESOLUTION_LABEL[b.resolution], Math.round(b.gpuFps), Math.round(b.cpuFps))}>
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
        <span><i aria-hidden="true" /> {T.legendFps}</span>
        <span><i className="cpu" aria-hidden="true" /> {T.legendCpu(Math.round(bottlenecks[0]!.cpuFps))}</span>
      </div>
      <TargetLine cfg={cfg} />
    </section>
  );
}

/** Mục tiêu tiếp theo: độ phân giải cao hơn (hoặc hiện tại nếu chưa tới 60 FPS) cần card nào để đạt 60 FPS */
function TargetLine({ cfg }: { cfg: MachineConfig }) {
  const { t } = useI18n();
  const order: Resolution[] = [1080, 1440, 2160];
  const res = estimateFps(cfg) < 60 ? cfg.resolution : order[order.indexOf(cfg.resolution) + 1];
  // laptop không thay card được: không gợi ý card mục tiêu
  if (!res || cfg.laptop) return null;
  const pick = GPUS.filter((g) => !g.integrated)
    .map((gpu) => ({ gpu, fps: estimateFps({ ...cfg, gpu, resolution: res }) }))
    .filter((x) => x.fps >= 60).sort((a, b) => a.gpu.raster - b.gpu.raster)[0];
  return (
    <p className="target">
      {pick ? t.machine.target(RESOLUTION_LABEL[res], pick.gpu.name, Math.round(pick.fps)) : t.machine.targetNone(RESOLUTION_LABEL[res])}
    </p>
  );
}

function NeedsCard({ needs }: { needs: Result["needs"] }) {
  const { t } = useI18n();
  const cls = (l: number) => (l >= 4 ? "pos" : l === 1 ? "neg" : l === 2 ? "warn" : "");
  return (
    <section className="panel s5" aria-labelledby="h-needs">
      <header><h2 id="h-needs">{t.machine.needs}</h2></header>
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

function UpgradesCard({ items, active, onPreview, laptop }: { laptop?: boolean; items: UpgradeSuggestion[]; active: UpgradeSuggestion | null; onPreview: (s: UpgradeSuggestion | null) => void }) {
  const { t, signedPct } = useI18n();
  const T = t.machine;
  return (
    <section className="panel s7" aria-labelledby="h-up">
      <header>
        <h2 id="h-up">{T.upgrades}</h2>
        <span className="meta">{T.upgradesMeta}</span>
      </header>
      {items.length === 0 ? (
        <p className="empty">{laptop ? T.noUpgradesLaptop : T.noUpgrades}</p>
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
                    {signedPct(s.powerGain)} {T.points}
                  </div>
                  <div className="line2 num">{s.fpsBefore} → {s.fpsAfter} FPS</div>
                </div>
                <button className="btn small" aria-pressed={on} onClick={() => onPreview(on ? null : s)}>{on ? T.viewing : T.tryIt}</button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FindingsCard({ findings, cfg }: { findings: Finding[]; cfg: MachineConfig }) {
  const { t } = useI18n();
  return (
    <section className="panel s5" aria-labelledby="h-find">
      <header><h2 id="h-find">{t.machine.checks}</h2></header>
      {findings.length === 0 ? (
        <p className="empty">{cfg.laptop ? t.machine.noFindingsLaptop(cfg.ramChannels === 2) : t.machine.noFindings(cfg.psuW, cfg.ramChannels === 2, cfg.pcieGen)}</p>
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
