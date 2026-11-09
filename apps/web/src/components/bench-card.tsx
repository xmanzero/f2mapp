"use client";
import type { BenchDevice, BenchResult } from "@f2m/shared";
import { useI18n } from "@/i18n/client";

export type MachineBench = BenchResult & { at?: string };

/** Thang của thanh so sánh: 0 → 130% trung bình, vạch dọc ở 100% */
const SCALE = 130;

/**
 * Hiệu năng đo thật (Blender Benchmark chạy trong pcdex-scan): điểm đo được của CPU / card,
 * so với điểm trung bình của cùng mẫu trên Blender Open Data. Chỉ hiện khi có số đo còn đúng với linh kiện đang lắp.
 */
export function BenchCard({ bench }: { bench: MachineBench }) {
  const { t, dateTime } = useI18n();
  const T = t.bench;
  const rows = ([["cpu", bench.cpu], ["gpu", bench.gpu]] as const).filter((x): x is ["cpu" | "gpu", BenchDevice] => !!x[1]);
  const low = rows.some(([, d]) => d.pct !== null && d.pct < 85);
  const verified = rows.some(([, d]) => d.trust === "verified");
  // lý do chưa xác minh (gộp các thiết bị); số đo trước pcdex-scan 0.6 không có trường trust
  const flags = [...new Set(rows.flatMap(([, d]) => d.trust === "verified" ? [] : d.flags ?? ["no_runs"]))].filter((f) => f !== "no_compare");
  return (
    <section className="panel" aria-labelledby="h-bench">
      <header>
        <h2 id="h-bench">{T.title}</h2>
        <span className="meta">{T.meta(bench.blender.replace(/\.0$/, ""), bench.at ? dateTime(bench.at) : null)}</span>
      </header>
      <ul className="bench-list">
        {rows.map(([kind, d]) => <BenchRow key={kind} kind={kind} d={d} />)}
      </ul>
      {low && <p className="bench-tip">{T.lowTip}</p>}
      {verified && <p className="bench-trust ok">{T.verified}</p>}
      {flags.length > 0 && <p className="bench-trust">{T.unverified(flags.map((f) => T.flags[f] ?? f).join(" · "))}</p>}
      <p className="faint" style={{ marginTop: 12, fontSize: "var(--fs-small)" }}>{T.how}</p>
    </section>
  );
}

function BenchRow({ kind, d }: { kind: "cpu" | "gpu"; d: BenchDevice }) {
  const { t, n0 } = useI18n();
  const T = t.bench;
  const tone = d.pct === null ? "" : d.pct >= 95 ? "pos" : d.pct >= 85 ? "" : "warn";
  return (
    <li className="bench-row">
      <div className="bench-head">
        <div>
          <span className="faint bench-kind">{kind === "cpu" ? "CPU" : T.gpu}</span>
          <strong>{d.part ?? d.raw}</strong>
        </div>
        {d.pct !== null
          ? <span className={`bench-pct num ${tone}${d.trust === "verified" ? "" : " dim"}`}>{d.pct}%</span>
          : <span className="faint num">{n0(d.points)}</span>}
      </div>
      {d.pct !== null && (
        <div className="bench-track" role="img" aria-label={T.aria(d.pct)}>
          <div className={tone} style={{ width: `${Math.min(d.pct, SCALE) / SCALE * 100}%` }} />
          <span className="bench-avg" style={{ left: `${100 / SCALE * 100}%` }} />
        </div>
      )}
      <p className="muted bench-note">
        {d.expected !== null ? T.vsAvg(n0(d.points), n0(d.expected)) : T.noCompare(n0(d.points), d.type)}
      </p>
    </li>
  );
}
