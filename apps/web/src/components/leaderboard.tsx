"use client";

import { useI18n } from "@/i18n/client";

import { computeScores, type MachineInput, resolveMachine, SCALE_VERSION, tierName as tn, tierOf, TIERS } from "@f2m/shared";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SAMPLE_MACHINES, personTint } from "@/data/sample";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useMachine } from "@/lib/use-machine";
import { MachineDetail, type DetailTarget } from "./machine-detail";
import { TierEmblem, tierVars } from "./tier";

type Filter = "all" | "legend" | "diamond" | "platinum" | "gold_down";
const FILTERS: [Filter, (code: string) => boolean][] = [
  ["all", () => true],
  ["legend", (c) => c === "legend"],
  ["diamond", (c) => c === "diamond"],
  ["platinum", (c) => c === "platinum"],
  ["gold_down", (c) => ["gold", "silver", "bronze"].includes(c)],
];
/** Dưới số máy thật này thì ghép thêm máy mẫu (có nhãn "mẫu") để bảng không trống */
const MIN_REAL = 10;

export interface ApiRow {
  userId: string; handle: string; displayName: string; province: string | null;
  cpu: string | null; gpu: string | null; ramGb: number; resolution: number; power: number; tier: string;
}
interface Row {
  key: string; name: string; sub: string; cpu: string; gpu: string; ramGb: number; resolution: number;
  power: number; tierCode: string; tierName: string; me: boolean; sample: boolean; initial: string;
  userId: string | null; machine: MachineInput | null;
}

const res = (r: number) => (r === 2160 ? "4K" : `${r}p`);

/** `initial`: bảng đã tải trên máy chủ (HTML có danh sách thật); trình duyệt vẫn tải lại bản mới */
export function Leaderboard({ initial }: { initial?: ApiRow[] } = {}) {
  const { user } = useSession();
  const { t, p: lp, n0, locale } = useI18n();
  const T = t.board;
  const tierName = (code: string) => ((x) => (x ? tn(x, locale) : code))(TIERS.find((x) => x.code === code));
  const { machine, isSample, ready } = useMachine();
  const [real, setReal] = useState<ApiRow[] | null>(initial?.length ? initial : null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<DetailTarget | null>(null);

  useEffect(() => {
    api<{ items: ApiRow[] }>("/v1/leaderboard").then((r) => setReal(r.items)).catch(() => { setReal([]); setFailed(true); });
  }, [user]);

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = (real ?? []).filter((r) => r.cpu && r.gpu).map((r) => ({
      key: r.userId, name: r.displayName, sub: [`@${r.handle}`, r.province].filter(Boolean).join(" · "),
      cpu: r.cpu!, gpu: r.gpu!, ramGb: r.ramGb, resolution: r.resolution, power: r.power,
      tierCode: r.tier, tierName: tierName(r.tier), me: !!user && r.userId === user.id, sample: false,
      initial: r.displayName.trim()[0]?.toUpperCase() ?? "?", userId: r.userId, machine: null,
    }));
    // khách đã khai báo máy trên trình duyệt: hiện tạm để thấy vị trí
    if (user === null && ready && !isSample) {
      const p = computeScores(resolveMachine(machine)).power;
      list.push({ key: "local", name: T.yourPc, sub: T.localSub, cpu: machine.cpu, gpu: machine.gpu,
        ramGb: machine.ramGb, resolution: machine.resolution, power: p, tierCode: tierOf(p).code, tierName: tn(tierOf(p), locale), me: true, sample: false, initial: "B",
        userId: null, machine });
    }
    if ((real?.length ?? 0) < MIN_REAL) {
      for (const s of SAMPLE_MACHINES) {
        const p = computeScores(resolveMachine(s.machine)).power;
        list.push({ key: `s-${s.handle}`, name: s.handle, sub: `${s.province} · ${T.samplePc}`, cpu: s.machine.cpu, gpu: s.machine.gpu,
          ramGb: s.machine.ramGb, resolution: s.machine.resolution, power: p, tierCode: tierOf(p).code, tierName: tn(tierOf(p), locale),
          me: false, sample: true, initial: s.handle[0]!.toUpperCase(), userId: null, machine: s.machine });
      }
    }
    return list.sort((a, b) => b.power - a.power);
  }, [real, user, machine, isSample, ready]);

  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  const me = ranked.find((r) => r.me);
  const realCount = real?.length ?? 0;
  const test = FILTERS.find((f) => f[0] === filter)![1];
  const shown = ranked.filter((r) => test(r.tierCode));
  const tint = (r: Row) => (r.me ? "var(--accent)" : personTint(r.name));
  const show = (r: Row & { rank: number }) => setOpen({ name: r.name, sub: r.sub, initial: r.initial, tint: tint(r), rank: r.rank, me: r.me, userId: r.userId, machine: r.machine });

  return (
    <>
      <div className="title-row">
        <div>
          <h1>{t.nav.board}</h1>
          <p className="sub">
            {real === null ? t.common.loading
              : me ? T.meRank(n0(me.power), me.rank, ranked.length)
              : user ? T.noPc(<Link href={lp("/may")} className="card-link">{T.declare}</Link>)
              : T.guest(ranked.length, <Link href={`${lp("/dang-nhap")}?next=/xep-hang`} className="card-link">{t.common.login}</Link>)}
          </p>
        </div>
        <span className="stamp">
          {failed ? T.failed : T.realCount(realCount, realCount < MIN_REAL, SCALE_VERSION)}
        </span>
      </div>

      {real !== null && ranked.length >= 3 && (
        <ol className="podium" aria-label={T.podium}>
          {ranked.slice(0, 3).map((r) => (
            <li key={r.key} className={`podium-card p${r.rank}${r.me ? " me" : ""}`} style={tierVars(r.tierCode)} onClick={() => show(r)}>
              <div className="podium-top">
                <span className="podium-rank num">#{r.rank}</span>
                <TierEmblem code={r.tierCode} label={r.tierName} size={44} />
              </div>
              <button className="podium-name row-open" onClick={(e) => { e.stopPropagation(); show(r); }}>{r.name}</button>
              <div className="faint" style={{ fontSize: 13 }}>{r.sub}</div>
              <div className="podium-score num tier-ink">{n0(r.power)}</div>
              <div className="faint" style={{ fontSize: 13 }}><span className="nw">{r.cpu}</span> + <span className="nw">{r.gpu}</span></div>
            </li>
          ))}
        </ol>
      )}

      <div className="counts" role="group" aria-label={T.filterTier}>
        {FILTERS.map(([key, f]) => (
          <button key={key} className="count" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            <span className="label">{T.filters[key]}</span>
            <span className="value num">{ranked.filter((r) => f(r.tierCode)).length}</span>
          </button>
        ))}
      </div>

      <section className="panel" aria-labelledby="h-board">
        <header>
          <h2 id="h-board">{T.filters[filter]}</h2>
          <span className="meta">{T.anchor}</span>
        </header>
        {real === null ? (
          <div aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 44, marginTop: 8 }} />)}</div>
        ) : shown.length === 0 ? (
          <p className="empty">{T.none}</p>
        ) : (
          <div className="table-wrap">
            <table className="data board">
              <thead>
                <tr>
                  <th className="r" style={{ width: 48 }}>#</th>
                  <th>{T.colPlayer}</th>
                  <th className="hide-sm">{T.colBuild}</th>
                  <th className="r">{T.colPower}</th>
                  <th className="hide-sm">{T.colTier}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.key} className={`clickable${r.me ? " me" : ""}`} onClick={() => show(r)}>
                    <td className="r num faint">{r.rank}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span className="avatar" style={{ background: tint(r) }} aria-hidden="true">{r.initial}</span>
                        <div style={{ minWidth: 0 }}>
                          <button className="row-open" onClick={(e) => { e.stopPropagation(); show(r); }} aria-label={T.viewPc(r.name)}>{r.name}</button>
                          <div className="faint" style={{ fontSize: 13 }}>
                            {r.sub}<span className="show-sm"> · <span className="nw">{r.cpu}</span> + <span className="nw">{r.gpu}</span></span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hide-sm">
                      <div><span className="nw">{r.cpu}</span> + <span className="nw">{r.gpu}</span></div>
                      <div className="faint" style={{ fontSize: 13 }}>{T.ramScreen(r.ramGb, res(r.resolution))}</div>
                    </td>
                    <td className="r">
                      <div className="num" style={{ fontWeight: 600, fontSize: 16 }}>{n0(r.power)}</div>
                      <div className="faint show-sm" style={{ fontSize: 13 }}>{r.tierName}</div>
                    </td>
                    <td className="hide-sm"><span className="pill tier-pill" style={tierVars(r.tierCode)}>{r.tierName}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <MachineDetail target={open} myPower={me?.power ?? null} onClose={() => setOpen(null)} />
    </>
  );
}
