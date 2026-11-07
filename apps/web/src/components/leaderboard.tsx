"use client";

import { computeScores, resolveMachine, tierOf, TIERS } from "@f2m/shared";
import { useMemo, useState } from "react";
import { SAMPLE_MACHINES, personTint } from "@/data/sample";
import { n0 } from "@/lib/format";
import { useMachine } from "@/lib/use-machine";

type Filter = "all" | "legend" | "diamond" | "platinum" | "gold_down";
const FILTERS: [Filter, string, (code: string) => boolean][] = [
  ["all", "Tất cả", () => true],
  ["legend", "Huyền thoại", (c) => c === "legend"],
  ["diamond", "Kim cương", (c) => c === "diamond"],
  ["platinum", "Bạch kim", (c) => c === "platinum"],
  ["gold_down", "Vàng trở xuống", (c) => ["gold", "silver", "bronze"].includes(c)],
];

export function Leaderboard() {
  const { machine, isSample, ready } = useMachine();
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const list = SAMPLE_MACHINES.map((s) => {
      const cfg = resolveMachine(s.machine);
      const power = computeScores(cfg).power;
      return { key: s.handle, handle: s.handle, province: s.province, cfg, power, tier: tierOf(power), me: false };
    });
    if (ready && !isSample) {
      const cfg = resolveMachine(machine);
      const power = computeScores(cfg).power;
      list.push({ key: "me", handle: "Máy của bạn", province: "Trình duyệt này", cfg, power, tier: tierOf(power), me: true });
    }
    return list.sort((a, b) => b.power - a.power).map((r, i) => ({ ...r, rank: i + 1 }));
  }, [machine, isSample, ready]);

  const me = rows.find((r) => r.me);
  const test = FILTERS.find((f) => f[0] === filter)![2];
  const shown = rows.filter((r) => test(r.tier.code));

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Bảng xếp hạng</h1>
          <p className="sub">
            {me ? `Máy của bạn (${n0(me.power)} điểm) đứng thứ ${me.rank} trên ${rows.length} máy.`
              : `${rows.length} máy, xếp theo điểm sức mạnh. Khai báo máy của bạn ở trang Máy của tôi để có tên trong bảng.`}
          </p>
        </div>
        <span className="stamp">Dữ liệu mẫu · thang điểm v0.5</span>
      </div>

      <div className="counts" role="group" aria-label="Lọc theo hạng">
        {FILTERS.map(([key, label, f]) => (
          <button key={key} className="count" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            <span className="label">{label}</span>
            <span className="value num">{rows.filter((r) => f(r.tier.code)).length}</span>
          </button>
        ))}
      </div>

      <section className="panel" aria-labelledby="h-board">
        <header>
          <h2 id="h-board">{FILTERS.find((f) => f[0] === filter)![1]}</h2>
          <span className="meta">Mốc 10.000 = Core i5-12400F + RTX 3060 12GB · hạng: {TIERS.map((t) => t.name).join(", ")}</span>
        </header>
        {shown.length === 0 ? (
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
                        <span className="avatar" style={{ background: r.me ? "var(--accent)" : personTint(r.handle) }} aria-hidden="true">
                          {r.me ? "B" : r.handle[0]!.toUpperCase()}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 500 }}>{r.handle}</div>
                          <div className="faint" style={{ fontSize: 13 }}>
                            {r.province}<span className="show-sm"> · <span className="nw">{r.cfg.cpu.name}</span> + <span className="nw">{r.cfg.gpu.name}</span></span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hide-sm">
                      <div><span className="nw">{r.cfg.cpu.name}</span> + <span className="nw">{r.cfg.gpu.name}</span></div>
                      <div className="faint" style={{ fontSize: 13 }}>{r.cfg.ramGb} GB RAM · màn hình {r.cfg.resolution === 2160 ? "4K" : `${r.cfg.resolution}p`}</div>
                    </td>
                    <td className="r">
                      <div className="num" style={{ fontWeight: 600, fontSize: 16 }}>{n0(r.power)}</div>
                      <div className="faint show-sm" style={{ fontSize: 13 }}>{r.tier.name}</div>
                    </td>
                    <td className="hide-sm"><span className="pill">{r.tier.name}</span></td>
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
