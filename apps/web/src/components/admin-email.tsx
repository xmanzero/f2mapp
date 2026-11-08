"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface Template {
  key: string; name: string; event: string; vars: { name: string; desc: string }[];
  subject: string; body: string; enabled: boolean; customized: boolean; updatedAt: string | null; updatedBy: string | null;
  defaultSubject: string; defaultBody: string; sent: number; lastSent: string | null;
}
type Draft = { subject: string; body: string; enabled: boolean };
const dayTime = (iso: string) => new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Mẫu thư: danh sách sự kiện, soạn tiêu đề / nội dung với biến, xem trước bằng dữ liệu mẫu, gửi thử, bật / tắt, khôi phục mặc định */
export function EmailTemplates({ defaultTo }: { defaultTo: string }) {
  const [list, setList] = useState<Template[] | null>(null);
  const [smtpReady, setSmtpReady] = useState(true);
  const [key, setKey] = useState("welcome");
  /** bản đang soạn của từng mẫu (chưa lưu); không có = đúng như bản đã lưu */
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api<{ templates: Template[]; smtpReady: boolean }>("/v1/admin/email/templates")
    .then((r) => { setList(r.templates); setSmtpReady(r.smtpReady); return r.templates; })
    .catch((e: ApiError) => { setError(e.message); return null; }), []);
  useEffect(() => { void load(); }, [load]);

  const cur = list?.find((t) => t.key === key) ?? null;
  const draft: Draft | null = cur ? drafts[key] ?? { subject: cur.subject, body: cur.body, enabled: cur.enabled } : null;
  const dirty = !!cur && !!draft && (draft.subject !== cur.subject || draft.body !== cur.body || draft.enabled !== cur.enabled);
  const setDraft = (d: Draft) => setDrafts((x) => ({ ...x, [key]: d }));

  const open = (k: string) => {
    if (k === key) return;
    if (dirty && !confirm("Mẫu đang sửa chưa lưu. Bỏ thay đổi?")) return;
    setKey(k);
  };

  if (error && !list) return <p className="form-error" role="alert">{error}</p>;
  if (!list || !cur || !draft) return <p className="muted">Đang tải…</p>;
  return (
    <>
      {!smtpReady && <p className="notice" style={{ marginBottom: 16 }}>Chưa cấu hình SMTP (hoặc đang tắt): thư sẽ không được gửi, chỉ ghi “bỏ qua” trong nhật ký. Cấu hình ở mục Máy chủ SMTP.</p>}
      <div className="mail-grid">
        <nav className="panel mail-list" aria-label="Mẫu thư">
          <ul>
            {list.map((t) => (
              <li key={t.key}>
                <button type="button" aria-current={t.key === key ? "true" : undefined} onClick={() => open(t.key)}>
                  <span className="mail-name">{t.name}{t.key === key && dirty && <span className="dot" aria-label="chưa lưu" />}</span>
                  <span className="mail-event">{t.event}</span>
                  <span className="mail-tags">
                    {!t.enabled && <span className="pill neg">Đang tắt</span>}
                    {t.customized && <span className="pill">Đã sửa</span>}
                    <span className="faint">{t.sent ? `${t.sent} thư đã gửi` : "Chưa gửi thư nào"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <Editor key={cur.key} t={cur} draft={draft} setDraft={setDraft} dirty={dirty} defaultTo={defaultTo} smtpReady={smtpReady}
          onSaved={(ts) => { setList(ts); setDrafts((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== key))); }} />
      </div>
    </>
  );
}

function Editor({ t, draft, setDraft, dirty, defaultTo, smtpReady, onSaved }: {
  t: Template; draft: Draft; setDraft: (d: Draft) => void;
  dirty: boolean; defaultTo: string; smtpReady: boolean; onSaved: (ts: Template[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string; warning: string | null } | null>(null);
  const [to, setTo] = useState(defaultTo);
  const [confirmReset, setConfirmReset] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<"subject" | "body">("body");

  // xem trước bản đang soạn (chưa cần lưu), chờ 400 ms sau lần gõ cuối
  useEffect(() => {
    const id = setTimeout(() => {
      if (!draft.subject.trim() || !draft.body.trim()) return;
      api<{ subject: string; html: string; warning: string | null }>(`/v1/admin/email/templates/${t.key}/preview`, { body: { subject: draft.subject, body: draft.body } })
        .then(setPreview).catch(() => {});
    }, 400);
    return () => clearTimeout(id);
  }, [t.key, draft.subject, draft.body]);

  const insert = (name: string) => {
    const tag = `{{${name}}}`;
    const field = lastField.current;
    const el = field === "subject" ? subjectRef.current : bodyRef.current;
    const value = field === "subject" ? draft.subject : draft.body;
    const start = el?.selectionStart ?? value.length, end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + tag + value.slice(end);
    setDraft({ ...draft, [field]: next });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + tag.length, start + tag.length); });
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: (e as ApiError).message }); }
    setBusy(false);
  };
  const save = () => run(async () => {
    const r = await api<{ templates: Template[] }>(`/v1/admin/email/templates/${t.key}`, { method: "PUT", body: draft });
    onSaved(r.templates);
    setMsg({ ok: true, text: draft.enabled ? "Đã lưu. Thư gửi từ giờ dùng mẫu này." : "Đã lưu. Mẫu đang tắt: sự kiện này sẽ không gửi thư." });
  });
  const reset = () => run(async () => {
    const r = await api<{ templates: Template[] }>(`/v1/admin/email/templates/${t.key}`, { method: "DELETE" });
    setConfirmReset(false);
    onSaved(r.templates);
    setMsg({ ok: true, text: "Đã khôi phục mẫu mặc định." });
  });
  const test = () => run(async () => {
    await api(`/v1/admin/email/templates/${t.key}/test`, { body: { subject: draft.subject, body: draft.body, to } });
    setMsg({ ok: true, text: `Đã gửi thử bản đang soạn tới ${to}, với dữ liệu mẫu.` });
  });

  return (
    <>
      <section className="panel mail-edit" aria-labelledby="h-mail-edit">
        <header>
          <div>
            <h2 id="h-mail-edit">{t.name}</h2>
            <p className="muted small">Gửi khi: {t.event}</p>
          </div>
          <label className="switch">
            <input type="checkbox" role="switch" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
            <span>{draft.enabled ? "Đang bật" : "Đang tắt"}</span>
          </label>
        </header>
        <form className="form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="field">
            <label htmlFor="mail-subject">Tiêu đề</label>
            <input id="mail-subject" ref={subjectRef} className="input" value={draft.subject} maxLength={200}
              onFocus={() => { lastField.current = "subject"; }} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="mail-body">Nội dung</label>
            <textarea id="mail-body" ref={bodyRef} className="input mail-body" rows={14} value={draft.body} maxLength={10000} spellCheck={false}
              onFocus={() => { lastField.current = "body"; }} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          </div>
          <div className="field">
            <span className="label-like">Biến <span className="faint small">· bấm để chèn vào chỗ con trỏ</span></span>
            <div className="chips mail-vars">
              {t.vars.map((v) => (
                <button key={v.name} type="button" className="chip" title={v.desc} onClick={() => insert(v.name)}>
                  <code>{`{{${v.name}}}`}</code><span className="faint">{v.desc}</span>
                </button>
              ))}
            </div>
            <details className="mail-help">
              <summary>Cú pháp</summary>
              <ul>
                <li><code>{"{{bien}}"}</code> chèn giá trị.</li>
                <li><code>{"{{#bien}} … {{/bien}}"}</code> chỉ hiện đoạn này khi biến có giá trị.</li>
                <li><code>**chữ**</code> in đậm; <code>[chữ](link)</code> là liên kết, đứng riêng một dòng thì thành nút.</li>
                <li>Dòng trống để sang đoạn mới.</li>
              </ul>
            </details>
          </div>
          {msg && <p className={msg.ok ? "ok-text" : "form-error"} role="status" style={{ marginTop: 0 }}>{msg.text}</p>}
          <div className="mail-actions">
            <button className="btn primary" disabled={busy || !dirty}>{busy ? "Đang lưu…" : dirty ? "Lưu mẫu" : "Đã lưu"}</button>
            {dirty && <button type="button" className="btn" onClick={() => setDraft({ subject: t.subject, body: t.body, enabled: t.enabled })}>Bỏ thay đổi</button>}
            {t.customized && (confirmReset ? (
              <span className="row-confirm">
                <span className="small">Dùng lại mẫu gốc?</span>
                <button type="button" className="btn small danger" onClick={reset}>Khôi phục</button>
                <button type="button" className="btn small" onClick={() => setConfirmReset(false)}>Thôi</button>
              </span>
            ) : <button type="button" className="link-btn" onClick={() => setConfirmReset(true)}>Khôi phục mặc định</button>)}
          </div>
          {t.updatedAt && <p className="faint small">Sửa lần cuối {dayTime(t.updatedAt)}{t.updatedBy ? ` bởi @${t.updatedBy}` : ""}.</p>}
        </form>
      </section>

      <section className="panel mail-preview" aria-labelledby="h-mail-preview">
        <header><h2 id="h-mail-preview">Xem trước</h2><span className="meta">Dữ liệu mẫu</span></header>
        {preview?.warning && <p className="form-error" role="alert" style={{ marginTop: 0 }}>{preview.warning}</p>}
        <p className="mail-subject"><span className="faint">Tiêu đề</span> {preview?.subject ?? "…"}</p>
        <iframe className="mail-frame" title="Xem trước thư" sandbox="" srcDoc={preview?.html ?? ""} />
        <div className="mail-test">
          <label htmlFor="mail-to" className="sr-only">Gửi thử tới</label>
          <input id="mail-to" className="input" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Gửi thử tới email" />
          <button type="button" className="btn" disabled={busy || !to || !smtpReady} onClick={test}>Gửi thử</button>
        </div>
        {!smtpReady && <p className="faint small">Cấu hình SMTP trước để gửi thử.</p>}
      </section>
    </>
  );
}

interface LogRow { id: string; template: string; to_email: string; subject: string; status: "sent" | "failed" | "skipped"; error: string | null; created_at: string; handle: string | null }
const STATUS: Record<LogRow["status"], [string, string]> = { sent: ["Đã gửi", "pos"], failed: ["Lỗi", "neg"], skipped: ["Bỏ qua", ""] };

/** Nhật ký gửi thư: lọc theo trạng thái */
export function EmailLog({ names }: { names: Record<string, string> }) {
  const [status, setStatus] = useState("all");
  const [items, setItems] = useState<LogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ items: LogRow[] }>(`/v1/admin/email/log?limit=200${status === "all" ? "" : `&status=${status}`}`)
      .then((r) => setItems(r.items)).catch((e: ApiError) => setError(e.message));
  }, [status]);
  return (
    <section className="panel" aria-label="Nhật ký gửi thư">
      <div className="admin-bar">
        <div className="segmented" role="group" aria-label="Lọc trạng thái">
          {([["all", "Tất cả"], ["sent", "Đã gửi"], ["failed", "Lỗi"], ["skipped", "Bỏ qua"]] as const).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>
          ))}
        </div>
        <span className="faint small">200 thư gần nhất</span>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!items ? <p className="muted">Đang tải…</p> : items.length === 0 ? <p className="muted">Chưa có thư nào.</p> : (
        <div className="table-wrap">
          <table className="data admin-table">
            <thead><tr><th>Thời gian</th><th>Mẫu</th><th>Người nhận</th><th>Tiêu đề</th><th>Kết quả</th></tr></thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id}>
                  <td className="num nw">{dayTime(l.created_at)}</td>
                  <td className="nw">{names[l.template] ?? (l.template === "smtp.test" ? "Thư thử SMTP" : l.template)}</td>
                  <td><div className="cell-name"><span>{l.to_email}</span>{l.handle && <span className="faint small">@{l.handle}</span>}</div></td>
                  <td className="mail-log-subject">{l.subject}</td>
                  <td><span className="tags"><span className={`pill ${STATUS[l.status][1]}`} title={l.error ?? undefined}>{STATUS[l.status][0]}</span>
                    {l.error && <span className="faint small">{l.error}</span>}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
