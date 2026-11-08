"use client";

import { computeScores, resolveMachine, SCALE_VERSION, tierOf, TIERS } from "@f2m/shared";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SAMPLE_MACHINES, personTint } from "@/data/sample";
import { api } from "@/lib/api";
import { n0 } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useMachine } from "@/lib/use-machine";
import { TierEmblem, tierVars } from "./tier";

type Filter = "all" | "legend" | "diamond" | "platinum" | "gold_down";
const FILTERS: [Filter, string, (code: string) => boolean][] = [
  ["all", "Tất cả", () => true],
  ["legend", "Huyền thoại", (c) => c === "legend"],
  ["diamond", "Kim cương", (c) => c === "diamond"],
  ["platinum", "Bạch kim", (c) => c === "platinum"],
  ["gold_down", "Vàng trở xuống", (c) => ["gold", "silver", "bronze"].includes(c)],
];
/** Dưới số máy thật này thì ghép thêm máy mẫu (có nhãn "mẫu") để bảng không trống */
const MIN_REAL = 10;

interface ApiRow {
  userId: string; handle: string; displayName: string; province: string | null;
  cpu: string | null; gpu: string | null; ramGb: number; resolution: number; power: number; tier: string;
}
interface Row {
  key: string; name: string; sub: string; cpu: string; gpu: string; ramGb: number; resolution: number;
  power: number; tierCode: string; tierName: string; me: boolean; sample: boolean; initial: string;
}

const tierName = (code: string) => TIERS.find((t) => t.code === code)?.name ?? code;
const res = (r: number) => (r === 2160 ? "4K" : `${r}p`);

export function Leaderboard() {
  const { user } = useSession();
  const { machine, isSample, ready } = useMachine();
  const [real, setReal] = useState<ApiRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    api<{ items: ApiRow[] }>("/v1/leaderboard").then((r) => setReal(r.items)).catch(() => { setReal([]); setFailed(true); });
  }, [user]);

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = (real ?? []).filter((r) => r.cpu && r.gpu).map((r) => ({
      key: r.userId, name: r.displayName, sub: [`@${r.handle}`, r.province].filter(Boolean).join(" · "),
      cpu: r.cpu!, gpu: r.gpu!, ramGb: r.ramGb, resolution: r.resolution, power: r.power,
      tierCode: r.tier, tierName: tierName(r.tier), me: !!user && r.userId === user.id, sample: false,
      initial: r.displayName.trim()[0]?.toUpperCase() ?? "?",
    }));
    // khách đã khai báo máy trên trình duyệt: hiện tạm để thấy vị trí
    if (user === null && ready && !isSample) {
      const p = computeScores(resolveMachine(machine)).power;
      list.push({ key: "local", name: "Máy của bạn", sub: "Chưa đăng nhập, chỉ bạn thấy", cpu: machine.cpu, gpu: machine.gpu,
        ramGb: machine.ramGb, resolution: machine.resolution, power: p, tierCode: tierOf(p).code, tierName: tierOf(p).name, me: true, sample: false, initial: "B" });
    }
    if ((real?.length ?? 0) < MIN_REAL) {
      for (const s of SAMPLE_MACHINES) {
        const p = computeScores(resolveMachine(s.machine)).power;
        list.push({ key: `s-${s.handle}`, name: s.handle, sub: `${s.province} · máy mẫu`, cpu: s.machine.cpu, gpu: s.machine.gpu,
          ramGb: s.machine.ramGb, resolution: s.machine.resolution, power: p, tierCode: tierOf(p).code, tierName: tierOf(p).name,
          me: false, sample: true, initial: s.handle[0]!.toUpperCase() });
      }
    }
    return list.sort((a, b) => b.power - a.power);
  }, [real, user, machine, isSample, ready]);

  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  const me = ranked.find((r) => r.me);
  const realCount = real?.length ?? 0;
  const test = FILTERS.find((f) => f[0] === filter)![2];
  const shown = ranked.filter((r) => test(r.tierCode));

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Bảng xếp hạng</h1>
          <p className="sub">
            {real === null ? "Đang tải…"
              : me ? `Máy của bạn (${n0(me.power)} điểm) đứng thứ ${me.rank} trên ${ranked.length} máy.`
              : user ? <>Bạn chưa khai báo máy. <Link href="/" className="card-link">Khai báo ở Máy của tôi</Link> để có tên trong bảng.</>
              : <>{ranked.length} máy, xếp theo điểm sức mạnh. <Link href="/dang-nhap?next=/xep-hang" className="card-link">Đăng nhập</Link> để có tên trong bảng.</>}
          </p>
        </div>
        <span className="stamp">
          {failed ? "Không tải được bảng thật, đang hiện máy mẫu" : `${realCount} máy thật${realCount < MIN_REAL ? " + máy mẫu" : ""} · thang điểm v${SCALE_VERSION}`}
        </span>
      </div>

      {real !== null && ranked.length >= 3 && (
        <ol className="podium" aria-label="Ba máy mạnh nhất">
          {ranked.slice(0, 3).map((r) => (
            <li key={r.key} className={`podium-card p${r.rank}${r.me ? " me" : ""}`} style={tierVars(r.tierCode)}>
              <div className="podium-top">
                <span className="podium-rank num">#{r.rank}</span>
                <TierEmblem code={r.tierCode} label={r.tierName} size={44} />
              </div>
              <div className="podium-name">{r.name}</div>
              <div className="faint" style={{ fontSize: 13 }}>{r.sub}</div>
              <div className="podium-score num tier-ink">{n0(r.power)}</div>
              <div className="faint" style={{ fontSize: 13 }}><span className="nw">{r.cpu}</span> + <span className="nw">{r.gpu}</span></div>
            </li>
          ))}
        </ol>
      )}

      <div className="counts" role="group" aria-label="Lọc theo hạng">
        {FILTERS.map(([key, label, f]) => (
          <button key={key} className="count" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            <span className="label">{label}</span>
            <span className="value num">{ranked.filter((r) => f(r.tierCode)).length}</span>
          </button>
        ))}
      </div>

      <section className="panel" aria-labelledby="h-board">
        <header>
          <h2 id="h-board">{FILTERS.find((f) => f[0] === filter)![1]}</h2>
          <span className="meta">Mốc 10.000 = Core i5-12400F + RTX 3060 12GB</span>
        </header>
        {real === null ? (
          <div aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 44, marginTop: 8 }} />)}</div>
        ) : shown.length === 0 ? (
          <p className="empty">Chưa có máy nào ở hạng này.</p>
        ) : (
          <div className="table-wrap">
            <table className="data board">
              <thead>
                <tr>
                  <th className="r" style={{ width: 48 }}>#</th>
                  <th>Người chơi</th>
                  <th className="hide-sm">Cấu hình</th>
                  <th className="r">Điểm sức mạnh</th>
                  <th className="hide-sm">Hạng</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.key} className={r.me ? "me" : undefined}>
                    <td className="r num faint">{r.rank}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span className="avatar" style={{ background: r.me ? "var(--accent)" : personTint(r.name) }} aria-hidden="true">{r.initial}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 500 }}>{r.name}</div>
                          <div className="faint" style={{ fontSize: 13 }}>
                            {r.sub}<span className="show-sm"> · <span className="nw">{r.cpu}</span> + <span className="nw">{r.gpu}</span></span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hide-sm">
                      <div><span className="nw">{r.cpu}</span> + <span className="nw">{r.gpu}</span></div>
                      <div className="faint" style={{ fontSize: 13 }}>{r.ramGb} GB RAM · màn hình {res(r.resolution)}</div>
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
    </>
  );
}
