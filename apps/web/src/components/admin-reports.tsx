"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { profilePath } from "@/lib/profile";

/** Trang quản trị giữ tiếng Việt (CLAUDE.md) */
interface Report {
  id: string; reason: string; note: string | null; status: string; created_at: string; conversation_id: string | null;
  resolution_note: string | null; resolved_at: string | null;
  targetId: string; targetHandle: string; targetName: string; targetBanned: boolean; targetReports?: number;
  reporterHandle: string | null; reporterName: string | null;
}
interface Msg { id: string; body: string; createdAt: string; sender: { handle: string; displayName: string }; isTarget: boolean; image: { id: string; width: number; height: number } | null }

const REASON: Record<string, string> = { spam: "Spam, quảng cáo", scam: "Lừa đảo", harassment: "Quấy rối", inappropriate: "Không phù hợp", other: "Khác" };
const dayTime = (iso: string) => new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Báo cáo người dùng: danh sách (đang mở / đã đóng) + chi tiết kèm hội thoại bị báo cáo, khóa tài khoản / đóng báo cáo */
export function AdminReports() {
  const [status, setStatus] = useState<"open" | "closed">("open");
  const [items, setItems] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ items: Report[] }>(`/v1/admin/reports?status=${status}`).then((r) => setItems(r.items)).catch((e: ApiError) => setError(e.message));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  if (error) return <p className="form-error">{error}</p>;
  return (
    <div className="grid split">
      <div className="col col-l">
        <section className="panel" aria-labelledby="h-reports">
          <header>
            <h2 id="h-reports">Báo cáo người dùng</h2>
            <div className="segmented" role="group" aria-label="Trạng thái">
              <button type="button" aria-pressed={status === "open"} onClick={() => { setStatus("open"); setCurrent(null); }}>Đang mở</button>
              <button type="button" aria-pressed={status === "closed"} onClick={() => { setStatus("closed"); setCurrent(null); }}>Đã đóng</button>
            </div>
          </header>
          {items === null ? <p className="muted">Đang tải…</p> : items.length === 0 ? <p className="muted">{status === "open" ? "Không có báo cáo nào cần xử lý." : "Chưa có báo cáo nào được đóng."}</p> : (
            <ul className="report-list">
              {items.map((r) => (
                <li key={r.id}>
                  <button type="button" className={`conv${current === r.id ? " active" : ""}`} onClick={() => setCurrent(r.id)}>
                    <span className="conv-body">
                      <span className="conv-top"><b>@{r.targetHandle}</b><small className="faint">{dayTime(r.created_at)}</small></span>
                      <small>
                        <span className="pill">{REASON[r.reason] ?? r.reason}</span>
                        {r.targetReports && r.targetReports > 1 ? <span className="pill warn" style={{ marginLeft: 6 }}>{r.targetReports} báo cáo</span> : null}
                        {r.targetBanned && <span className="pill" style={{ marginLeft: 6 }}>đã khóa</span>}
                      </small>
                      <span className="conv-last">bởi {r.reporterHandle ? `@${r.reporterHandle}` : "tài khoản đã xóa"}{r.note ? ` — ${r.note}` : ""}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <div className="col col-r">
        {current ? <ReportDetail key={current} id={current} onDone={() => { setCurrent(null); load(); }} />
          : <section className="panel"><p className="muted">Chọn một báo cáo để xem hội thoại và xử lý.</p></section>}
      </div>
    </div>
  );
}

function ReportDetail({ id, onDone }: { id: string; onDone: () => void }) {
  const [d, setD] = useState<{ report: Report; messages: Msg[] } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ report: Report; messages: Msg[] }>(`/v1/admin/reports/${id}`).then(setD).catch((e: ApiError) => setError(e.message)); }, [id]);
  if (error) return <p className="form-error">{error}</p>;
  if (!d) return <section className="panel"><p className="muted">Đang tải…</p></section>;
  const r = d.report;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError((e as ApiError).message); setBusy(false); return false; }
    setBusy(false); return true;
  };
  const resolve = (status: "resolved" | "dismissed") => act(() => api(`/v1/admin/reports/${id}/resolve`, { method: "POST", body: { status, note: note.trim() || undefined } })).then((ok) => ok && onDone());
  const ban = async () => {
    const reason = note.trim() || `Vi phạm: ${REASON[r.reason] ?? r.reason}`;
    if (!window.confirm(`Khóa tài khoản @${r.targetHandle}? Người này mất phiên đăng nhập, tin rao bị ẩn.`)) return;
    if (await act(() => api(`/v1/admin/users/${r.targetId}`, { method: "PATCH", body: { banned: true, reason } })))
      await resolve("resolved");
  };

  return (
    <section className="panel" aria-labelledby="h-report-detail">
      <header><h2 id="h-report-detail">@{r.targetHandle}</h2><span className="meta">{dayTime(r.created_at)}</span></header>
      <dl className="detail-spec">
        <div><dt>Người bị báo cáo</dt><dd><Link href={profilePath(r.targetHandle)} target="_blank" className="card-link">{r.targetName} (@{r.targetHandle})</Link>{r.targetBanned && " · đã khóa"}</dd></div>
        <div><dt>Người báo cáo</dt><dd>{r.reporterHandle ? <Link href={profilePath(r.reporterHandle)} target="_blank" className="card-link">@{r.reporterHandle}</Link> : "tài khoản đã xóa"}</dd></div>
        <div><dt>Lý do</dt><dd>{REASON[r.reason] ?? r.reason}</dd></div>
        {r.note && <div><dt>Mô tả</dt><dd>{r.note}</dd></div>}
        {r.status !== "open" && <div><dt>Kết quả</dt><dd>{r.status === "resolved" ? "Đã xử lý" : "Bỏ qua"}{r.resolution_note ? ` — ${r.resolution_note}` : ""}</dd></div>}
      </dl>

      <h3 className="sheet-h">{r.conversation_id ? `Hội thoại (${d.messages.length} tin)` : "Báo cáo từ hồ sơ — không kèm hội thoại"}</h3>
      {d.messages.length > 0 && (
        <div className="thread-msgs admin-thread">
          {d.messages.map((m) => (
            <div key={m.id} className={`bubble${m.isTarget ? " target" : " mine"}`}>
              <small className="faint">@{m.sender.handle} · {dayTime(m.createdAt)}</small>
              {m.image && (
                <a href={`/api/v1/messages/images/${m.image.id}`} target="_blank" rel="noopener" className="bubble-img">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/v1/messages/images/${m.image.id}`} alt="Ảnh" width={m.image.width} height={m.image.height} loading="lazy" />
                </a>
              )}
              {m.body && <p>{m.body}</p>}
            </div>
          ))}
        </div>
      )}

      {r.status === "open" && (
        <div className="report-admin-actions">
          <label className="field"><span>Ghi chú xử lý (cũng là lý do khóa nếu khóa tài khoản)</span>
            <input className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="report-actions">
            {!r.targetBanned && <button type="button" className="btn" style={{ color: "var(--negative)" }} disabled={busy} onClick={() => void ban()}>Khóa tài khoản</button>}
            <button type="button" className="btn" disabled={busy} onClick={() => void resolve("dismissed")}>Bỏ qua</button>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void resolve("resolved")}>Đã xử lý</button>
          </div>
        </div>
      )}
    </section>
  );
}
