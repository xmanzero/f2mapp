"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { n0 } from "@/lib/format";

/** Trang quản trị giữ tiếng Việt (CLAUDE.md) */
interface Summary { kind: string; name: string; users: number; runs: number; medianPoints: number; medianPct: number | null; catalog: number | null; source: string | null }
interface Recent {
  id: string; kind: string; part: string | null; raw: string; api: string; points: number; pct: number | null;
  trust: string; flags: string[]; tool: string | null; created_at: string; handle: string | null;
}

const FLAG: Record<string, string> = {
  no_runs: "thiếu kết quả gốc (phần mềm cũ)", checksum: "sai checksum Blender / cảnh", inconsistent: "điểm không khớp kết quả gốc",
  threads: "số luồng CPU không khớp bản quét", nonce: "không có mã đo hợp lệ / đo quá nhanh", outlier: "lệch bất thường so với trung bình",
  no_compare: "không so được (CUDA, mẫu chưa có)",
};
const SOURCE: Record<string, string> = { blender: "Blender Open Data", est: "ước tính", measured: "số đo người dùng" };
/** build_parts.py chỉ thay số ước tính khi đủ ngần này người đo (CALIB_MIN) */
const CALIB_MIN = 5;
const dayTime = (iso: string) => new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Số đo hiệu năng: tổng hợp theo mẫu (để hiệu chỉnh danh mục) và các lượt đo gần đây */
export function AdminBench() {
  const [data, setData] = useState<{ summary: Summary[]; recent: Recent[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ summary: Summary[]; recent: Recent[] }>("/v1/admin/bench").then(setData).catch((e: ApiError) => setError(e.message)); }, []);
  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <p className="muted">Đang tải…</p>;
  const ready = data.summary.filter((s) => s.source === "est" && s.users >= CALIB_MIN).length;
  return (
    <div className="grid">
      <section className="panel s12" aria-labelledby="h-bench-sum">
        <header>
          <h2 id="h-bench-sum">Số đo đã xác minh theo mẫu</h2>
          <a className="btn small" href="/api/v1/admin/bench/calibration" download="bench-calibration.json">Tải JSON hiệu chỉnh</a>
        </header>
        <p className="muted" style={{ marginBottom: 12 }}>
          Mẫu đang dùng điểm render <b>ước tính</b> sẽ được thay bằng trung vị số đo khi có từ {CALIB_MIN} người đo khác nhau:
          tải JSON, lưu vào <code>data/bench-calibration.json</code>, chạy <code>python -I tools/build_parts.py</code> rồi deploy.
          {ready > 0 ? <> Hiện có <b>{ready}</b> mẫu đủ điều kiện.</> : " Hiện chưa mẫu nào đủ."}
        </p>
        {data.summary.length === 0 ? <p className="muted">Chưa có số đo nào được xác minh.</p> : (
          <div className="table-wrap">
            <table className="data admin-table">
              <thead><tr><th>Mẫu</th><th className="r">Người đo</th><th className="r">Trung vị đo</th><th className="r">Danh mục</th><th className="r">% danh mục</th><th>Nguồn điểm danh mục</th></tr></thead>
              <tbody>
                {data.summary.map((s) => (
                  <tr key={s.kind + s.name}>
                    <td><span className="faint small">{s.kind === "cpu" ? "CPU" : "Card"}</span> {s.name}</td>
                    <td className="r num">{s.users}{s.runs > s.users && <span className="faint"> ({s.runs} lượt)</span>}</td>
                    <td className="r num">{n0(s.medianPoints)}</td>
                    <td className="r num">{s.catalog === null ? "—" : n0(s.catalog)}</td>
                    <td className="r num">{s.medianPct === null ? "—" : `${s.medianPct}%`}</td>
                    <td>{s.source ? SOURCE[s.source] ?? s.source : "—"}{s.source === "est" && s.users >= CALIB_MIN && <span className="pill pos" style={{ marginLeft: 8 }}>đủ để hiệu chỉnh</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel s12" aria-labelledby="h-bench-recent">
        <header><h2 id="h-bench-recent">Lượt đo gần đây</h2><span className="meta">60 lượt gần nhất, kể cả chưa xác minh</span></header>
        {data.recent.length === 0 ? <p className="muted">Chưa có lượt đo nào.</p> : (
          <div className="table-wrap">
            <table className="data admin-table">
              <thead><tr><th>Lúc</th><th>Người dùng</th><th>Thiết bị</th><th className="r">Điểm</th><th className="r">%</th><th>Xác minh</th><th>Phần mềm</th></tr></thead>
              <tbody>
                {data.recent.map((r) => (
                  <tr key={r.id}>
                    <td className="faint num">{dayTime(r.created_at)}</td>
                    <td>{r.handle ? `@${r.handle}` : <span className="faint">đã xóa</span>}</td>
                    <td>{r.part ?? r.raw} <span className="faint small">{r.api}</span></td>
                    <td className="r num">{n0(r.points)}</td>
                    <td className="r num">{r.pct === null ? "—" : `${r.pct}%`}</td>
                    <td>{r.trust === "verified" ? <span className="pill pos">Đã xác minh</span>
                      : <span className="faint small">{r.flags.map((f) => FLAG[f] ?? f).join(" · ") || "chưa xác minh"}</span>}</td>
                    <td className="faint small">{r.tool ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
