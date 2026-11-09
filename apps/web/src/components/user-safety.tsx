"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { api, ApiError } from "@/lib/api";

const REASONS = ["spam", "scam", "harassment", "inappropriate", "other"] as const;

/**
 * Menu "…" cho một người dùng: Báo cáo, Chặn / Bỏ chặn. conversationId: báo cáo từ trong hội thoại (quản trị viên đọc được hội thoại đó).
 * onBlocked: báo trạng thái chặn mới cho chỗ gọi (ẩn ô soạn tin, nút theo dõi…).
 */
export function UserSafetyMenu({ handle, name, blocked, conversationId, onBlocked }: {
  handle: string; name: string; blocked: boolean; conversationId?: string; onBlocked: (b: boolean) => void;
}) {
  const { t } = useI18n();
  const T = t.safety;
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  const toggleBlock = async () => {
    setOpen(false);
    if (!blocked && !window.confirm(T.blockConfirm(name))) return;
    try {
      const r = await api<{ blocked: boolean }>(`/v1/users/${encodeURIComponent(handle)}/block`, { method: blocked ? "DELETE" : "POST", body: {} });
      onBlocked(r.blocked);
    } catch (e) { window.alert((e as ApiError).message); }
  };

  return (
    <div className="safety" ref={box}>
      <button type="button" className="icon-btn safety-btn" aria-label={T.more} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        <MoreHorizontal aria-hidden="true" />
      </button>
      {open && (
        <div className="safety-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); setReport(true); }}>{T.report}</button>
          <button type="button" role="menuitem" onClick={toggleBlock}>{blocked ? T.unblock : T.block}</button>
        </div>
      )}
      {report && <ReportDialog handle={handle} name={name} conversationId={conversationId} onClose={(b) => { setReport(false); if (b) onBlocked(true); }} />}
    </div>
  );
}

/** Hộp thoại báo cáo: lý do, mô tả, chặn luôn. onClose(true) khi đã chặn luôn. */
function ReportDialog({ handle, name, conversationId, onClose }: { handle: string; name: string; conversationId?: string; onClose: (blocked: boolean) => void }) {
  const { t } = useI18n();
  const T = t.safety;
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<(typeof REASONS)[number] | "">("");
  const [note, setNote] = useState("");
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { ref.current?.showModal(); }, []);

  const submit = async () => {
    if (!reason) return;
    setBusy(true); setError(null);
    try {
      await api("/v1/reports", { method: "POST", body: { handle, conversationId, reason, note: note.trim() || undefined, block } });
      setDone(true);
    } catch (e) { setError((e as ApiError).message); }
    setBusy(false);
  };

  return (
    <dialog ref={ref} className="report-dialog" aria-labelledby="h-report" onClose={() => onClose(done && block)}
      onClick={(e) => { if (e.target === e.currentTarget) ref.current?.close(); }}>
      <div className="report-body">
        <h2 id="h-report">{T.reportTitle(name)}</h2>
        {done ? (
          <>
            <p>{T.sent}</p>
            <div className="report-actions"><button type="button" className="btn" onClick={() => ref.current?.close()}>{t.common.close}</button></div>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <p className="muted">{T.reportSub}</p>
            <fieldset className="report-reasons">
              {REASONS.map((r) => (
                <label key={r}><input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} /> {T.reasons[r]}</label>
              ))}
            </fieldset>
            <label className="field"><span>{T.note}</span>
              <textarea className="input" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <label className="report-block"><input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} /> {T.alsoBlock}</label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="report-actions">
              <button type="button" className="btn" onClick={() => ref.current?.close()}>{t.common.cancel}</button>
              <button className="btn primary" disabled={!reason || busy}>{T.send}</button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
