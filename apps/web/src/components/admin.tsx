"use client";

import { listingPath } from "@/lib/listing-url";
import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { n0, vnd } from "@/lib/format";
import { KIND_LABEL } from "@/lib/listings";
import { useSession } from "@/lib/session";
import { AdminBench } from "./admin-bench";
import { AdminReports } from "./admin-reports";
import { AdminBranding } from "./admin-branding";
import { EmailLog, EmailTemplates } from "./admin-email";

type Tab = "overview" | "users" | "listings" | "bao-cao" | "email" | "so-do" | "thuong-hieu";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Tổng quan" }, { id: "users", label: "Người dùng" }, { id: "listings", label: "Tin rao" }, { id: "bao-cao", label: "Báo cáo" }, { id: "email", label: "Email" }, { id: "so-do", label: "Số đo" }, { id: "thuong-hieu", label: "Thương hiệu" },
];
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("vi-VN") : "—");
const dayTime = (iso: string) => new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Trang quản trị: chỉ tài khoản có vai trò admin. Máy chủ kiểm quyền từng yêu cầu; ở đây chỉ để ẩn giao diện. */
export function Admin() {
  const { user } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "overview") as Tab;

  if (user === undefined) return <div className="title-row"><div><h1>Quản trị</h1><p className="sub">Đang tải…</p></div></div>;
  if (!user || user.role !== "admin")
    return (
      <>
        <div className="title-row"><div><h1>Quản trị</h1><p className="sub">Trang này chỉ dành cho quản trị viên.</p></div></div>
        {!user && <p className="empty"><Link href="/dang-nhap?next=/quan-tri" className="card-link">Đăng nhập</Link></p>}
      </>
    );

  return (
    <>
      <div className="title-row">
        <div><h1>Quản trị</h1><p className="sub">Người dùng, tin rao và cấu hình hệ thống của pcdex.</p></div>
      </div>
      <div className="segmented admin-tabs" role="tablist" aria-label="Mục quản trị">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} aria-pressed={tab === t.id}
            onClick={() => router.replace(t.id === "overview" ? "/quan-tri" : `/quan-tri?tab=${t.id}`, { scroll: false })}>{t.label}</button>
        ))}
      </div>
      {tab === "overview" && <Overview />}
      {tab === "users" && <Users meId={user.id} />}
      {tab === "listings" && <Listings />}
      {tab === "email" && <Email defaultTo={user.email ?? ""} />}
      {tab === "bao-cao" && <AdminReports />}
      {tab === "so-do" && <AdminBench />}
      {tab === "thuong-hieu" && <AdminBranding />}
    </>
  );
}

// ---------- tổng quan ----------
interface Stats {
  users: number; usersToday: number; banned: number; machines: number; scannedMachines: number;
  listingsLive: number; listingsToday: number; listingsRemoved: number; scansToday: number;
}
interface LogRow { id: string; admin_handle: string; action: string; target: string | null; detail: Record<string, unknown> | null; created_at: string }
const ACTION: Record<string, string> = {
  "user.ban": "khóa tài khoản", "user.unban": "mở khóa tài khoản", "user.role": "đổi quyền", "user.delete": "xóa tài khoản",
  "listing.remove": "gỡ tin", "listing.restore": "khôi phục tin", "listing.delete": "xóa tin", "smtp.update": "sửa cấu hình SMTP", "smtp.test": "gửi thư thử",
  "email.template": "sửa mẫu thư", "email.template.reset": "khôi phục mẫu thư",
  "report.resolve": "xử lý báo cáo", "report.dismiss": "bỏ qua báo cáo",
  "branding.text": "sửa tên / slogan", "branding.asset": "đổi ảnh thương hiệu", "branding.reset": "dùng lại ảnh mặc định",
};

function Overview() {
  const [data, setData] = useState<{ stats: Stats; log: LogRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ stats: Stats; log: LogRow[] }>("/v1/admin/stats").then(setData).catch((e: ApiError) => setError(e.message)); }, []);
  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <p className="muted">Đang tải…</p>;
  const s = data.stats;
  const tiles: [string, number, string][] = [
    ["Người dùng", s.users, `+${n0(s.usersToday)} trong 24 giờ`], ["Bị khóa", s.banned, "tài khoản"],
    ["Máy đã khai", s.machines, `${n0(s.scannedMachines)} máy đã quét`], ["Tin đang bán", s.listingsLive, `+${n0(s.listingsToday)} trong 24 giờ`],
    ["Tin đã gỡ", s.listingsRemoved, "do quản trị viên"], ["Lượt quét", s.scansToday, "trong 24 giờ"],
  ];
  return (
    <div className="grid">
      <section className="panel s12" aria-label="Số liệu">
        <div className="admin-tiles">
          {tiles.map(([label, value, note]) => (
            <div key={label}><span className="label">{label}</span><span className="value num">{n0(value)}</span><span className="faint small">{note}</span></div>
          ))}
        </div>
      </section>
      <section className="panel s12" aria-labelledby="h-log">
        <header><h2 id="h-log">Nhật ký quản trị</h2><span className="meta">30 thao tác gần nhất</span></header>
        {data.log.length === 0 ? <p className="muted">Chưa có thao tác nào.</p> : (
          <ul className="admin-log">
            {data.log.map((l) => (
              <li key={l.id}>
                <span className="faint num">{dayTime(l.created_at)}</span>
                <span><b>@{l.admin_handle}</b> {ACTION[l.action] ?? l.action}{l.target ? <> · <span className="muted">{l.target}</span></> : null}
                  {l.detail && typeof l.detail.reason === "string" ? <span className="faint"> — {l.detail.reason}</span> : null}
                  {l.detail && l.detail.ok === false ? <span className="faint"> — lỗi</span> : null}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------- người dùng ----------
interface AdminUser {
  id: string; handle: string; displayName: string; email: string | null; province: string | null; role: "user" | "admin";
  bannedAt: string | null; banReason: string | null; createdAt: string; lastSeenAt: string | null; machines: number; listings: number; providers: string[];
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="search admin-search">
      <Search aria-hidden="true" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}
function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function Users({ meId }: { meId: string }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "banned" | "admin">("all");
  const [items, setItems] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [act, setAct] = useState<{ id: string; kind: "ban" | "delete" } | null>(null);
  const [reason, setReason] = useState("");
  const dq = useDebounced(q);
  const load = useCallback(() => api<{ items: AdminUser[] }>(`/v1/admin/users?q=${encodeURIComponent(dq)}&filter=${filter}`)
    .then((r) => setItems(r.items)).catch((e: ApiError) => setError(e.message)), [dq, filter]);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); setAct(null); setReason(""); await load(); } catch (e) { setError((e as ApiError).message); }
  };
  const patch = (id: string, body: object) => run(() => api(`/v1/admin/users/${id}`, { method: "PATCH", body }));

  return (
    <section className="panel" aria-label="Người dùng">
      <div className="admin-bar">
        <SearchBox value={q} onChange={setQ} placeholder="Tìm tên, @tài khoản, email" />
        <div className="segmented" role="group" aria-label="Lọc">
          {([["all", "Tất cả"], ["banned", "Bị khóa"], ["admin", "Quản trị viên"]] as const).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!items ? <p className="muted">Đang tải…</p> : items.length === 0 ? <p className="muted">Không có người dùng nào khớp.</p> : (
        <div className="table-wrap">
          <table className="data admin-table">
            <thead><tr><th>Người dùng</th><th>Tham gia</th><th>Hoạt động</th><th className="r">Máy</th><th className="r">Tin</th><th>Đăng nhập</th><th>Trạng thái</th><th className="r">Thao tác</th></tr></thead>
            <tbody>
              {items.map((u) => {
                const me = u.id === meId;
                return (
                  <tr key={u.id}>
                    <td><div className="cell-name"><b>{u.displayName}</b><span className="faint small">@{u.handle}{u.email ? ` · ${u.email}` : ""}{u.province ? ` · ${u.province}` : ""}</span></div></td>
                    <td className="num nw">{day(u.createdAt)}</td>
                    <td className="num nw">{day(u.lastSeenAt)}</td>
                    <td className="r num">{u.machines}</td>
                    <td className="r num">{u.listings}</td>
                    <td className="nw small">{u.providers.map((p) => (p === "google" ? "Google" : "Mật khẩu")).join(", ") || "—"}</td>
                    <td>
                      <span className="tags">
                        {u.role === "admin" && <span className="pill pos">Quản trị</span>}
                        {u.bannedAt ? <span className="pill neg" title={u.banReason ?? undefined}>Bị khóa{u.banReason ? `: ${u.banReason}` : ""}</span> : null}
                        {me && <span className="pill">Bạn</span>}
                      </span>
                    </td>
                    <td className="r">
                      {me ? <span className="faint small">—</span> : act?.id === u.id ? (
                        <span className="row-confirm">
                          {act.kind === "ban" && <input className="input mini" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do (người dùng sẽ thấy)" aria-label="Lý do khóa" autoFocus />}
                          {act.kind === "delete" && <span className="small">Xóa @{u.handle} và mọi dữ liệu?</span>}
                          <button type="button" className="btn small danger" onClick={() => act.kind === "ban" ? patch(u.id, { banned: true, reason }) : run(() => api(`/v1/admin/users/${u.id}`, { method: "DELETE" }))}>
                            {act.kind === "ban" ? "Khóa" : "Xóa hẳn"}</button>
                          <button type="button" className="btn small" onClick={() => { setAct(null); setReason(""); }}>Thôi</button>
                        </span>
                      ) : (
                        <span className="row-actions">
                          {u.bannedAt
                            ? <button type="button" className="link-btn" onClick={() => patch(u.id, { banned: false })}>Mở khóa</button>
                            : <button type="button" className="link-btn" onClick={() => setAct({ id: u.id, kind: "ban" })}>Khóa</button>}
                          <button type="button" className="link-btn" onClick={() => patch(u.id, { role: u.role === "admin" ? "user" : "admin" })}>
                            {u.role === "admin" ? "Bỏ quyền admin" : "Cấp quyền admin"}</button>
                          <button type="button" className="link-btn danger-text" onClick={() => setAct({ id: u.id, kind: "delete" })}>Xóa</button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------- tin rao ----------
interface AdminListing {
  id: string; kind: string; name: string; priceVnd: number; status: string; province: string | null; createdAt: string; expiresAt: string;
  removedAt: string | null; removedReason: string | null; photos: number; description: string | null;
  seller: { id: string; handle: string; displayName: string; banned: boolean };
}
const STATUS_LABEL: Record<string, string> = { active: "Đang bán", reserved: "Đã hẹn", sold: "Đã bán", hidden: "Ẩn", expired: "Hết hạn" };

function Listings() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("live");
  const [items, setItems] = useState<AdminListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [act, setAct] = useState<{ id: string; kind: "remove" | "delete" } | null>(null);
  const [reason, setReason] = useState("");
  const dq = useDebounced(q);
  const load = useCallback(() => api<{ items: AdminListing[] }>(`/v1/admin/listings?q=${encodeURIComponent(dq)}&status=${status}`)
    .then((r) => setItems(r.items)).catch((e: ApiError) => setError(e.message)), [dq, status]);
  useEffect(() => { void load(); }, [load]);
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); setAct(null); setReason(""); await load(); } catch (e) { setError((e as ApiError).message); }
  };

  return (
    <section className="panel" aria-label="Tin rao">
      <div className="admin-bar">
        <SearchBox value={q} onChange={setQ} placeholder="Tìm linh kiện, mô tả, @người bán" />
        <div className="segmented" role="group" aria-label="Lọc trạng thái">
          {([["live", "Đang bán"], ["removed", "Đã gỡ"], ["expired", "Hết hạn"], ["hidden", "Ẩn"], ["sold", "Đã bán"], ["all", "Tất cả"]] as const).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>
          ))}
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!items ? <p className="muted">Đang tải…</p> : items.length === 0 ? <p className="muted">Không có tin nào.</p> : (
        <div className="table-wrap">
          <table className="data admin-table">
            <thead><tr><th>Tin</th><th>Người bán</th><th className="r">Giá</th><th>Trạng thái</th><th>Đăng</th><th className="r">Ảnh</th><th className="r">Thao tác</th></tr></thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id}>
                  <td><div className="cell-name"><Link href={listingPath({ id: l.id, name: l.name, province: l.province })} className="card-link" target="_blank">{l.name}</Link>
                    <span className="faint small">{KIND_LABEL[l.kind as keyof typeof KIND_LABEL] ?? l.kind}{l.province ? ` · ${l.province}` : ""}{l.description ? ` · ${l.description.slice(0, 60)}` : ""}</span></div></td>
                  <td className="nw">@{l.seller.handle}{l.seller.banned && <span className="pill neg" style={{ marginLeft: 6 }}>Bị khóa</span>}</td>
                  <td className="r num nw">{vnd(l.priceVnd)}</td>
                  <td><span className="tags">
                    {l.removedAt ? <span className="pill neg" title={l.removedReason ?? undefined}>Đã gỡ{l.removedReason ? `: ${l.removedReason}` : ""}</span>
                      : <span className={`pill ${l.status === "active" ? "pos" : ""}`}>{STATUS_LABEL[l.status] ?? l.status}</span>}
                  </span></td>
                  <td className="num nw">{day(l.createdAt)}</td>
                  <td className="r num">{l.photos}</td>
                  <td className="r">
                    {act?.id === l.id ? (
                      <span className="row-confirm">
                        {act.kind === "remove" && <input className="input mini" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do gỡ (người bán sẽ thấy)" aria-label="Lý do gỡ" autoFocus />}
                        {act.kind === "delete" && <span className="small">Xóa hẳn tin và ảnh?</span>}
                        <button type="button" className="btn small danger" onClick={() => run(() => act.kind === "remove"
                          ? api(`/v1/admin/listings/${l.id}`, { method: "PATCH", body: { removed: true, reason } })
                          : api(`/v1/admin/listings/${l.id}`, { method: "DELETE" }))}>{act.kind === "remove" ? "Gỡ tin" : "Xóa hẳn"}</button>
                        <button type="button" className="btn small" onClick={() => { setAct(null); setReason(""); }}>Thôi</button>
                      </span>
                    ) : (
                      <span className="row-actions">
                        {l.removedAt
                          ? <button type="button" className="link-btn" onClick={() => run(() => api(`/v1/admin/listings/${l.id}`, { method: "PATCH", body: { removed: false } }))}>Khôi phục</button>
                          : <button type="button" className="link-btn" onClick={() => setAct({ id: l.id, kind: "remove" })}>Gỡ</button>}
                        <button type="button" className="link-btn danger-text" onClick={() => setAct({ id: l.id, kind: "delete" })}>Xóa</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------- email (SMTP) ----------
interface Smtp { host: string; port: number; security: "ssl" | "starttls" | "none"; user: string; fromName: string; fromEmail: string; enabled: boolean; hasPassword: boolean }
const PRESETS: { label: string; host: string; port: number; security: Smtp["security"] }[] = [
  { label: "Gmail / Google Workspace", host: "smtp.gmail.com", port: 587, security: "starttls" },
  { label: "Zoho Mail", host: "smtp.zoho.com", port: 465, security: "ssl" },
  { label: "Amazon SES (Singapore)", host: "email-smtp.ap-southeast-1.amazonaws.com", port: 587, security: "starttls" },
  { label: "Resend", host: "smtp.resend.com", port: 465, security: "ssl" },
];

const MAIL_NAMES: Record<string, string> = {
  welcome: "Chào mừng", verify_email: "Xác minh email", password_reset: "Quên mật khẩu", password_changed: "Mật khẩu đã đổi",
  new_login: "Thiết bị mới", account_banned: "Tài khoản bị khóa", listing_removed: "Tin bị gỡ",
};
type MailSub = "mau" | "smtp" | "nhat-ky";

/** Email: mẫu thư theo sự kiện, máy chủ SMTP, nhật ký gửi */
function Email({ defaultTo }: { defaultTo: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const sub = (["mau", "smtp", "nhat-ky"].includes(params.get("muc") ?? "") ? params.get("muc") : "mau") as MailSub;
  return (
    <>
      <div className="segmented admin-sub" role="tablist" aria-label="Mục email">
        {([["mau", "Mẫu thư"], ["smtp", "Máy chủ SMTP"], ["nhat-ky", "Nhật ký gửi"]] as const).map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={sub === v} aria-pressed={sub === v}
            onClick={() => router.replace(`/quan-tri?tab=email${v === "mau" ? "" : `&muc=${v}`}`, { scroll: false })}>{l}</button>
        ))}
      </div>
      {sub === "mau" && <EmailTemplates defaultTo={defaultTo} />}
      {sub === "smtp" && <SmtpSettings defaultTo={defaultTo} />}
      {sub === "nhat-ky" && <EmailLog names={MAIL_NAMES} />}
    </>
  );
}

function SmtpSettings({ defaultTo }: { defaultTo: string }) {
  const [f, setF] = useState({ host: "", port: "587", security: "starttls" as Smtp["security"], user: "", password: "", fromName: "pcdex", fromEmail: "", enabled: true });
  const [hasPassword, setHasPassword] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);
  const [keyReady, setKeyReady] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [to, setTo] = useState(defaultTo);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<{ smtp: Smtp | null; keyReady: boolean }>("/v1/admin/settings/smtp").then((r) => {
      setKeyReady(r.keyReady);
      if (r.smtp) {
        setF((x) => ({ ...x, host: r.smtp!.host, port: String(r.smtp!.port), security: r.smtp!.security, user: r.smtp!.user, fromName: r.smtp!.fromName, fromEmail: r.smtp!.fromEmail, enabled: r.smtp!.enabled }));
        setHasPassword(r.smtp.hasPassword);
      }
      setLoaded(true);
    }).catch((e: ApiError) => { setMsg({ ok: false, text: e.message }); setLoaded(true); });
  }, []);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v })); setMsg(null); };

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ smtp: Smtp }>("/v1/admin/settings/smtp", {
        method: "PUT",
        body: { host: f.host, port: Number(f.port), security: f.security, user: f.user, fromName: f.fromName, fromEmail: f.fromEmail, enabled: f.enabled,
          ...(clearPassword ? { password: null } : f.password ? { password: f.password } : {}) },
      });
      setHasPassword(r.smtp.hasPassword); setClearPassword(false); set("password", "");
      setMsg({ ok: true, text: "Đã lưu cấu hình." });
    } catch (e) { setMsg({ ok: false, text: (e as ApiError).message }); }
    setBusy(false);
  };
  const test = async () => {
    setTestMsg({ ok: true, text: "Đang gửi…" });
    try {
      await api("/v1/admin/settings/smtp/test", { body: { to } });
      setTestMsg({ ok: true, text: `Đã gửi tới ${to}. Kiểm tra hộp thư (cả mục Spam).` });
    } catch (e) { setTestMsg({ ok: false, text: (e as ApiError).message }); }
  };

  if (!loaded) return <p className="muted">Đang tải…</p>;
  return (
    <div className="grid">
      <section className="panel s7" aria-labelledby="h-smtp">
        <header><h2 id="h-smtp">Máy chủ gửi thư (SMTP)</h2><span className="meta">Dùng cho mọi thư tự động (xem mục Mẫu thư)</span></header>
        {!keyReady && <p className="notice">Máy chủ chưa có <b>SETTINGS_KEY</b> nên chưa lưu được mật khẩu SMTP.</p>}
        <form className="form" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="field">
            <span className="label-like">Mẫu nhanh</span>
            <div className="chips">
              {PRESETS.map((p) => <button key={p.label} type="button" className="chip" onClick={() => setF((x) => ({ ...x, host: p.host, port: String(p.port), security: p.security }))}>{p.label}</button>)}
            </div>
          </div>
          <div className="row2">
            <div className="field"><label htmlFor="smtp-host">Máy chủ <span className="req">*</span></label>
              <input id="smtp-host" className="input" value={f.host} onChange={(e) => set("host", e.target.value)} placeholder="smtp.gmail.com" autoComplete="off" /></div>
            <div className="field"><label htmlFor="smtp-port">Cổng <span className="req">*</span></label>
              <input id="smtp-port" className="input" inputMode="numeric" value={f.port} onChange={(e) => set("port", e.target.value.replace(/\D/g, ""))} /></div>
          </div>
          <div className="field">
            <span className="label-like">Mã hóa</span>
            <div className="segmented" role="group" aria-label="Mã hóa">
              {([["starttls", "STARTTLS (587)"], ["ssl", "SSL/TLS (465)"], ["none", "Không (nội bộ)"]] as const).map(([v, l]) => (
                <button key={v} type="button" aria-pressed={f.security === v} onClick={() => set("security", v)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="row2">
            <div className="field"><label htmlFor="smtp-user">Tài khoản</label>
              <input id="smtp-user" className="input" value={f.user} onChange={(e) => set("user", e.target.value)} autoComplete="off" placeholder="thường là email gửi" /></div>
            <div className="field"><label htmlFor="smtp-pass">Mật khẩu</label>
              <input id="smtp-pass" className="input" type="password" value={f.password} onChange={(e) => { set("password", e.target.value); setClearPassword(false); }} autoComplete="new-password"
                placeholder={hasPassword ? "Đã lưu · bỏ trống để giữ" : "Mật khẩu ứng dụng"} />
              {hasPassword && <label className="small check"><input type="checkbox" checked={clearPassword} onChange={(e) => setClearPassword(e.target.checked)} /> Xóa mật khẩu đã lưu</label>}
            </div>
          </div>
          <div className="row2">
            <div className="field"><label htmlFor="smtp-from-name">Tên người gửi</label>
              <input id="smtp-from-name" className="input" value={f.fromName} onChange={(e) => set("fromName", e.target.value)} /></div>
            <div className="field"><label htmlFor="smtp-from">Email người gửi <span className="req">*</span></label>
              <input id="smtp-from" className="input" type="email" value={f.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} placeholder="no-reply@pcdex.app" /></div>
          </div>
          <label className="check"><input type="checkbox" checked={f.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Bật gửi thư</label>
          {msg && <p className={msg.ok ? "ok-text" : "form-error"} role="status">{msg.text}</p>}
          <button className="btn primary" disabled={busy}>{busy ? "Đang lưu…" : "Lưu cấu hình"}</button>
        </form>
      </section>

      <section className="panel s5" aria-labelledby="h-test">
        <header><h2 id="h-test">Gửi thư thử</h2></header>
        <p className="muted small">Lưu cấu hình trước, rồi gửi một thư thử để chắc máy chủ SMTP nhận đăng nhập và cho gửi từ địa chỉ người gửi.</p>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="smtp-to">Gửi tới</label>
          <input id="smtp-to" className="input" type="email" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" className="btn" style={{ marginTop: 12 }} onClick={test} disabled={!to}>Gửi thư thử</button>
        {testMsg && <p className={testMsg.ok ? "ok-text" : "form-error"} role="status" style={{ marginTop: 10 }}>{testMsg.text}</p>}
        <p className="faint small" style={{ marginTop: 16 }}>Gmail: bật xác minh 2 bước rồi tạo “Mật khẩu ứng dụng” (16 ký tự) để dùng ở ô Mật khẩu; không dùng mật khẩu Gmail thường.</p>
      </section>
    </div>
  );
}
