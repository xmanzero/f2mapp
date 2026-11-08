"use client";

import { useI18n } from "@/i18n/client";

import { ANCHOR_CPU, ANCHOR_GPU, bottleneck, computeScores, CPUS, GPUS, resolveMachine, tierName, tierOf, type Resolution } from "@f2m/shared";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSession } from "@/lib/session";
import { Combo } from "./combo";
import { LangSwitch } from "./lang-switch";
import { TierEmblem, tierVars } from "./tier";

/** Góc phải trên của landing: vào app (đã đăng nhập) hoặc đăng nhập */
export function TopLink() {
  const { user } = useSession();
  const { t, p } = useI18n();
  return (
    <div className="lp-top">
      <LangSwitch />
      {user ? <Link href={p("/may")} className="lp-toplink">{t.landing.toMachine(user.displayName.split(" ").slice(-1)[0]!)}</Link>
        : <Link href={`${p("/dang-nhap")}?next=/may`} className="lp-toplink">{t.common.login}</Link>}
    </div>
  );
}

// ---------- màn đầu: chấm điểm sống ----------
const RES: [Resolution, string][] = [[1080, "1080p"], [1440, "1440p"], [2160, "4K"]];
const ANCHOR_POWER = (() => {
  const cfg = resolveMachine({ cpu: ANCHOR_CPU, gpu: ANCHOR_GPU, ramGb: 16, ramChannels: 2, storage: "nvme4", pcieGen: 4, psuW: 750, resolution: 1440 });
  return computeScores(cfg).power;
})();

/** Chọn CPU + card → điểm sức mạnh, hạng, FPS theo màn hình, chỗ nghẽn. Dùng đúng công thức của app (packages/shared). */
export function LiveScore() {
  const { t, n0, ratio, locale } = useI18n();
  const [cpu, setCpu] = useState("Core i5-14600K");
  const [gpu, setGpu] = useState("RTX 4070 Super");
  const r = useMemo(() => {
    const cfg = resolveMachine({ cpu, gpu, ramGb: 32, ramChannels: 2, storage: "nvme4", pcieGen: 4, psuW: 850, resolution: 1440 });
    const s = computeScores(cfg);
    const fps = RES.map(([res, label]) => ({ label, b: bottleneck(cfg, res) }));
    return { power: s.power, tier: tierOf(s.power), fps, max: Math.max(...fps.flatMap((f) => [f.b.gpuFps, f.b.cpuFps])) * 1.08 };
  }, [cpu, gpu]);
  const cpuOpts = useMemo(() => CPUS.map((c) => ({ value: c.name, label: c.name })), []);
  const gpuOpts = useMemo(() => GPUS.filter((g) => !g.integrated).map((g) => ({ value: g.name, label: g.name, hint: `${g.vramGb} GB` })), []);
  const neck = r.fps[0]!.b.side === "cpu" && r.fps[0]!.b.loss > 0.08;

  return (
    <div className="lp-live" data-ui style={tierVars(r.tier.code)} aria-label={t.landing.tryAria}>
      <div className="lp-live-pick">
        <label htmlFor="lp-cpu">CPU</label>
        <Combo id="lp-cpu" value={cpu} options={cpuOpts} onChange={setCpu} ariaLabel={t.landing.chooseCpu} />
        <label htmlFor="lp-gpu">{t.landing.gpu}</label>
        <Combo id="lp-gpu" value={gpu} options={gpuOpts} onChange={setGpu} ariaLabel={t.landing.chooseGpu} />
      </div>
      <div className="lp-live-score">
        <TierEmblem code={r.tier.code} size={52} label={r.tier.name} />
        <div>
          <output className="lp-live-power num tier-ink" htmlFor="lp-cpu lp-gpu" aria-live="polite">{n0(r.power)}</output>
          <div className="lp-live-tier">{t.landing.tierLine(tierName(r.tier, locale), ratio(r.power / ANCHOR_POWER))}</div>
        </div>
      </div>
      <ul className="lp-live-fps">
        {r.fps.map(({ label, b }) => (
          <li key={label}>
            <span className="res">{label}</span>
            <span className="track" aria-hidden="true">
              <i className="fill" style={{ width: `${(b.fps / r.max) * 100}%` }} />
              <i className="cpu" style={{ left: `${(b.cpuFps / r.max) * 100}%` }} />
            </span>
            <span className="val num"><b>{Math.round(b.fps)}</b> FPS</span>
          </li>
        ))}
      </ul>
      <p className="lp-live-note">{neck
        ? t.landing.cpuHolds(Math.round(r.fps[0]!.b.loss * 100))
        : t.landing.gpuFull}</p>
    </div>
  );
}

// ---------- dải giao diện ----------
export interface Panel { src: string; w: number; h: number; name: string; text: string; alt: string }

export function Showcase({ panels }: { panels: Panel[] }) {
  const row = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  const [active, setActive] = useState(0);
  // mảnh đang chọn = mảnh có tâm gần tâm hàng nhất
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    let raf = 0;
    const pick = () => {
      const mid = el.getBoundingClientRect().left + el.clientWidth / 2;
      let best = 0, dist = Infinity;
      el.querySelectorAll<HTMLElement>("[data-i]").forEach((f) => {
        const b = f.getBoundingClientRect();
        const d = Math.abs(b.left + b.width / 2 - mid);
        if (d < dist) { dist = d; best = Number(f.dataset.i); }
      });
      setActive(best);
    };
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(pick); };
    pick();
    el.addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => { el.removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, []);
  const go = (i: number) => {
    const el = row.current?.querySelector<HTMLElement>(`[data-i="${i}"]`);
    el?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", inline: "center", block: "nearest" });
  };
  const p = panels[active]!;
  return (
    <div className="lp-show">
      <div ref={row} className="lp-show-row" tabIndex={0} aria-label={t.landing.showAria}
        onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(Math.min(panels.length - 1, active + 1)); } if (e.key === "ArrowLeft") { e.preventDefault(); go(Math.max(0, active - 1)); } }}>
        {panels.map((x, i) => (
          <figure key={x.src} data-i={i} className={i === active ? "on" : undefined} onClick={() => go(i)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh chụp giao diện, đã là WebP đúng cỡ */}
            <img src={x.src} width={x.w} height={x.h} alt={x.alt} loading={i < 2 ? "eager" : "lazy"} />
          </figure>
        ))}
      </div>
      <div className="lp-show-cap" aria-live="polite" data-reveal data-d="2">
        <h3>{p.name}</h3>
        <p>{p.text}</p>
        <div className="lp-dots" role="group" aria-label={t.landing.pickScreen}>
          {panels.map((x, i) => <button key={x.src} type="button" aria-label={x.name} aria-pressed={i === active} onClick={() => go(i)} />)}
        </div>
      </div>
    </div>
  );
}

// ---------- mảnh cấu hình có chú thích ----------
export interface Note { name: string; text: string; top: number; height: number; side: "l" | "r" }

export function PanelNotes({ src, w, h, alt, notes }: { src: string; w: number; h: number; alt: string; notes: Note[] }) {
  const [hot, setHot] = useState<number | null>(null);
  const note = (n: Note, i: number) => (
    <li key={n.name} className={hot === i ? "hot" : undefined} style={{ top: `${n.top}%` }} data-reveal data-d={(i % 4) + 1}
      tabIndex={0} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(i)} onBlur={() => setHot(null)}>
      <h3>{n.name}</h3>
      <p>{n.text}</p>
    </li>
  );
  return (
    <div className="lp-notes">
      <ul className="lp-notes-l">{notes.map((n, i) => n.side === "l" && note(n, i))}</ul>
      <div className={`lp-notes-panel${hot !== null ? " dim" : ""}`} data-ui>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={w} height={h} alt={alt} loading="lazy" />
        {hot !== null && <i className="lp-spot" style={{ top: `${notes[hot]!.top}%`, height: `${notes[hot]!.height}%` }} aria-hidden="true" />}
      </div>
      <ul className="lp-notes-r">{notes.map((n, i) => n.side === "r" && note(n, i))}</ul>
    </div>
  );
}

// ---------- các bước, kéo thanh trượt ----------
export interface Stage { name: string; clause: [string, string]; src: string; w: number; h: number; alt: string }

export function Stages({ stages }: { stages: Stage[] }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const s = stages[i]!;
  return (
    <div className="lp-stages">
      <div className="lp-stages-text">
        <h2 key={i} className="lp-fadein"><span>{s.clause[0]}</span> <span>{s.clause[1]}</span></h2>
      </div>
      <div className="lp-stages-frag" data-ui>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={s.src} className="lp-fadein" src={s.src} width={s.w} height={s.h} alt={s.alt} loading="lazy" />
      </div>
      <div className="lp-stages-ctl" data-reveal data-d="1">
        <input type="range" min={0} max={stages.length - 1} step={1} value={i} onChange={(e) => setI(Number(e.target.value))}
          aria-label={t.landing.stepAria} aria-valuetext={s.name} style={{ ["--p" as string]: `${(i / (stages.length - 1)) * 100}%` }} />
        <ol>
          {stages.map((x, k) => (
            <li key={x.name}><button type="button" aria-pressed={k === i} onClick={() => setI(k)}>{x.name}</button></li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ---------- nền tảng ----------
export interface Platform { id: string; name: string; status: string; live: boolean; rows: [string, string, string][] }

export function Platforms({ items, action }: { items: Platform[]; action: ReactNode }) {
  const { t } = useI18n();
  const [id, setId] = useState(items[0]!.id);
  const p = items.find((x) => x.id === id)!;
  return (
    <div className="lp-plat">
      <div className="lp-plat-head" data-reveal>
        <h2>{t.landing.platformsTitle(t.landing.platformsSoft)}</h2>
        {action}
      </div>
      <div className="lp-plat-body">
        <div className="lp-plat-tabs" role="tablist" aria-label={t.landing.platforms} data-reveal data-d="1">
          {items.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={x.id === id} id={`tab-${x.id}`} aria-controls="lp-plat-panel" onClick={() => setId(x.id)}>
              <b>{x.name}</b><small>{x.status}</small>
            </button>
          ))}
        </div>
        <ul className="lp-plat-rows" id="lp-plat-panel" role="tabpanel" aria-labelledby={`tab-${p.id}`}>
          {p.rows.map(([tag, title, note], k) => (
            <li key={title} data-reveal data-d={Math.min(k + 1, 4)}>
              <span className="tag">{tag}</span>
              <span className="what"><b>{title}</b><small>{note}</small></span>
              <span className={`state${p.live ? " live" : ""}`}>{p.live ? t.landing.live : t.landing.soon}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------- hiện dần khi cuộn tới (tắt khi giảm chuyển động; nội dung luôn hiện nếu không có JS) ----------
export function Reveal() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];
    els.forEach((e) => e.classList.add("rv"));
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { (e.target as HTMLElement).classList.add("in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -12% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return null;
}
