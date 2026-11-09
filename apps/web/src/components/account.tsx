"use client";

import { useI18n } from "@/i18n/client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, type Profile } from "@/lib/api";
import { PROVINCES } from "@/lib/provinces";
import { useSession } from "@/lib/session";
import { profilePath } from "@/lib/profile";
import { Combo } from "./combo";
import { PasswordInput } from "./login";

/** Đặt mật khẩu (tài khoản Google) hoặc đổi mật khẩu */
function PasswordForm({ hasPassword, onDone }: { hasPassword: boolean; onDone: (u: Profile) => void }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const T = t.account;
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [state, setState] = useState<{ busy: boolean; error: string | null; ok: boolean }>({ busy: false, error: null, ok: false });

  if (!open)
    return (
      <div style={{ marginTop: 12 }}>
        {state.ok && <p className="stamp" role="status" style={{ marginBottom: 8 }}>{T.pwSaved}</p>}
        <button className="link" onClick={() => setOpen(true)}>{hasPassword ? T.changePw : T.setPw}</button>
      </div>
    );
  const submit = async () => {
    setState({ busy: true, error: null, ok: false });
    try {
      const r = await api<{ user: Profile }>("/v1/me/password", { body: { currentPassword: hasPassword ? cur : undefined, newPassword: next } });
      onDone(r.user);
      setOpen(false); setCur(""); setNext("");
      setState({ busy: false, error: null, ok: true });
    } catch (e) {
      setState({ busy: false, error: (e as ApiError).message, ok: false });
    }
  };
  return (
    <form className="form" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      {hasPassword && (
        <div className="field">
          <label htmlFor="cur-pw">{T.curPw} <span className="req" aria-hidden="true">*</span></label>
          <PasswordInput id="cur-pw" value={cur} onChange={setCur} autoComplete="current-password" />
        </div>
      )}
      <div className="field">
        <label htmlFor="new-pw">{T.newPw} <span className="req" aria-hidden="true">*</span></label>
        <PasswordInput id="new-pw" value={next} onChange={setNext} autoComplete="new-password" minLength={8} describedBy="new-pw-hint" />
        <span id="new-pw-hint" className="hint">{T.newPwHint}</span>
      </div>
      {state.error && <p className="form-error" role="alert" style={{ marginTop: 0 }}>{state.error}</p>}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn primary" disabled={state.busy}>{state.busy ? t.common.saving : T.savePw}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>{t.common.cancel}</button>
      </div>
    </form>
  );
}

export function Account() {
  const router = useRouter();
  const isNew = useSearchParams().get("moi") === "1";
  const { user, setUser, logout } = useSession();
  const { t, p } = useI18n();
  const T = t.account;
  const [form, setForm] = useState({ displayName: "", handle: "", province: "" });
  const [state, setState] = useState<{ busy: boolean; error: string | null; saved: boolean }>({ busy: false, error: null, saved: false });

  useEffect(() => {
    if (user) setForm({ displayName: user.displayName, handle: user.handle, province: user.province ?? "" });
  }, [user]);

  if (user === undefined) return <div className="title-row"><div><h1>{t.pages.account}</h1><p className="sub">{t.common.loading}</p></div></div>;
  if (user === null)
    return (
      <>
        <div className="title-row"><div><h1>{t.pages.account}</h1><p className="sub">{T.notLoggedIn}</p></div></div>
        <p className="empty">{T.loginWhy} <Link href={`${p("/dang-nhap")}?next=/tai-khoan`} className="card-link">{t.common.login}</Link></p>
      </>
    );

  const save = async () => {
    setState({ busy: true, error: null, saved: false });
    try {
      const r = await api<{ user: Profile }>("/v1/me", { method: "PATCH", body: { ...form, province: form.province || null } });
      setUser(r.user);
      setState({ busy: false, error: null, saved: true });
    } catch (e) {
      setState({ busy: false, error: (e as ApiError).message, saved: false });
    }
  };
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [k]: e.target.value });
    setState((s) => ({ ...s, saved: false }));
  };

  return (
    <>
      <div className="title-row">
        <div>
          <h1>{t.pages.account}</h1>
          <p className="sub">{isNew ? T.created : `@${user.handle}`} · <Link href={p(profilePath(user.handle))} className="card-link">{t.profile.mine}</Link></p>
        </div>
      </div>

      <div className="grid">
        <section className="panel s7" aria-labelledby="h-profile">
          <header><h2 id="h-profile">{T.profile}</h2><span className="meta">{T.profileMeta}</span></header>
          <form className="form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <div className="field">
              <label htmlFor="displayName">{T.displayName} <span className="req" aria-hidden="true">*</span></label>
              <input id="displayName" className="input" value={form.displayName} onChange={set("displayName")} maxLength={40} required minLength={2} />
            </div>
            <div className="field">
              <label htmlFor="handle">{T.handle} <span className="req" aria-hidden="true">*</span></label>
              <input id="handle" className="input" value={form.handle} onChange={set("handle")} maxLength={20} aria-describedby="handle-hint"
                autoCapitalize="none" autoCorrect="off" spellCheck={false} />
              <span id="handle-hint" className="hint">{T.handleHint}</span>
            </div>
            <div className="field">
              <label htmlFor="province">{T.province}</label>
              <Combo id="province" value={form.province} onChange={(v) => setForm((x) => ({ ...x, province: v }))} placeholder={t.post.areaPh}
                options={[{ value: "", label: t.post.notChosen }, ...PROVINCES.map((p) => ({ value: p, label: p }))]} />
            </div>
            {state.error && <p className="form-error" role="alert">{state.error}</p>}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="btn primary" disabled={state.busy}>{state.busy ? t.common.saving : t.common.save}</button>
              {state.saved && <span className="stamp" role="status">{t.common.saved}</span>}
            </div>
          </form>
        </section>

        <section className="panel s5" aria-labelledby="h-signin">
          <header><h2 id="h-signin">{T.signin}</h2></header>
          <ul className="rows">
            <li className="row">
              <div className="grow"><div style={{ fontWeight: 500 }}>{T.emailPw}</div><div className="line2">{user.hasPassword ? user.email : T.noPw}</div></div>
              {user.hasPassword && <span className="pill pos">{T.inUse}</span>}
            </li>
            <li className="row">
              <div className="grow"><div style={{ fontWeight: 500 }}>Google</div><div className="line2">{user.providers.includes("google") ? user.email : T.notLinked}</div></div>
              {user.providers.includes("google") && <span className="pill pos">{T.inUse}</span>}
            </li>
          </ul>
          {user.email && <VerifyEmail email={user.email} verified={user.emailVerified} />}
          {user.email && <PasswordForm hasPassword={user.hasPassword} onDone={setUser} />}
          <button className="btn" style={{ marginTop: 16 }} onClick={async () => { await logout(); router.push(p("/")); }}>{t.common.logout}</button>
        </section>

        <BlockedList />
        <DeleteAccount handle={user.handle} />
      </div>
    </>
  );
}

/** Tự xóa tài khoản: gõ lại tên tài khoản để xác nhận. Không hoàn tác được. */
/** Người đã chặn (bỏ chặn ngay tại đây) */
function BlockedList() {
  const { t, p } = useI18n();
  const [items, setItems] = useState<{ handle: string; displayName: string }[] | null>(null);
  useEffect(() => { api<{ items: { handle: string; displayName: string }[] }>("/v1/me/blocks").then((r) => setItems(r.items)).catch(() => setItems([])); }, []);
  const unblock = async (handle: string) => {
    await api(`/v1/users/${encodeURIComponent(handle)}/block`, { method: "DELETE" }).catch(() => {});
    setItems((x) => x?.filter((i) => i.handle !== handle) ?? null);
  };
  return (
    <section className="panel s12" aria-labelledby="h-blocked">
      <header><h2 id="h-blocked">{t.safety.blockedList}</h2></header>
      {items === null ? <div className="skeleton" style={{ height: 40 }} />
        : items.length === 0 ? <p className="muted">{t.safety.blockedNone}</p>
        : (
          <ul className="follow-list">
            {items.map((i) => (
              <li key={i.handle} className="follow-row">
                <Link href={p(profilePath(i.handle))} style={{ color: "inherit", textDecoration: "none" }}><b>{i.displayName}</b> <span className="faint small">@{i.handle}</span></Link>
                <button type="button" className="btn small" style={{ marginLeft: "auto" }} onClick={() => void unblock(i.handle)}>{t.safety.unblock}</button>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

function DeleteAccount({ handle }: { handle: string }) {
  const router = useRouter();
  const { refresh } = useSession();
  const { t, p } = useI18n();
  const T = t.account;
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = typed.trim().replace(/^@/, "").toLowerCase() === handle;
  const run = async () => {
    setBusy(true); setError(null);
    try {
      await api("/v1/me", { method: "DELETE", body: { confirm: typed } });
      try { localStorage.removeItem("f2m.spec.v1"); localStorage.removeItem("f2m.contact"); } catch { /* bỏ qua */ }
      await refresh();
      router.push(p("/"));
    } catch (e) { setError((e as ApiError).message); setBusy(false); }
  };
  return (
    <section className="panel s12 danger-zone" aria-labelledby="h-delete">
      <header><h2 id="h-delete">{T.deleteTitle}</h2></header>
      <p className="muted">{T.deleteText(handle)}</p>
      {!open ? (
        <button type="button" className="btn danger-outline" onClick={() => setOpen(true)}>{T.deleteOpen}</button>
      ) : (
        <div className="field" style={{ maxWidth: 420, marginTop: 12 }}>
          <label htmlFor="del-confirm">{T.typeToConfirm(handle)}</label>
          <input id="del-confirm" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} autoFocus />
          {error && <p className="field-error" role="alert">{error}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="btn danger" disabled={!ok || busy} onClick={run}>{busy ? T.deleting : T.deleteForever}</button>
            <button type="button" className="btn" onClick={() => { setOpen(false); setTyped(""); setError(null); }}>{T.never}</button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Trạng thái xác minh email + gửi lại thư xác minh */
function VerifyEmail({ email, verified }: { email: string; verified: boolean }) {
  const [state, setState] = useState<{ busy: boolean; msg: string | null; ok: boolean }>({ busy: false, msg: null, ok: true });
  const { t } = useI18n();
  const T = t.account;
  if (verified) return <p className="verify-row"><span className="pill pos">{T.verified}</span><span className="muted">{email}</span></p>;
  const send = async () => {
    setState({ busy: true, msg: null, ok: true });
    try {
      await api("/v1/me/verify-email", { body: {} });
      setState({ busy: false, ok: true, msg: T.verifySent(email) });
    } catch (e) { setState({ busy: false, ok: false, msg: (e as ApiError).message }); }
  };
  return (
    <div className="verify-box">
      <p><span className="pill warn">{T.unverified}</span> {T.verifyWhy}</p>
      <button type="button" className="btn small" disabled={state.busy} onClick={send}>{state.busy ? T.sending : T.sendVerify}</button>
      {state.msg && <p className={state.ok ? "ok-text" : "form-error"} role="status">{state.msg}</p>}
    </div>
  );
}
