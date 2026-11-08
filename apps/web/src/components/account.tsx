"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, type Profile } from "@/lib/api";
import { PROVINCES } from "@/lib/provinces";
import { useSession } from "@/lib/session";
import { PasswordInput } from "./login";

/** Đặt mật khẩu (tài khoản Google) hoặc đổi mật khẩu */
function PasswordForm({ hasPassword, onDone }: { hasPassword: boolean; onDone: (u: Profile) => void }) {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [state, setState] = useState<{ busy: boolean; error: string | null; ok: boolean }>({ busy: false, error: null, ok: false });

  if (!open)
    return (
      <div style={{ marginTop: 12 }}>
        {state.ok && <p className="stamp" role="status" style={{ marginBottom: 8 }}>Đã lưu mật khẩu. Các thiết bị khác đã bị đăng xuất.</p>}
        <button className="link" onClick={() => setOpen(true)}>{hasPassword ? "Đổi mật khẩu" : "Đặt mật khẩu để đăng nhập bằng email"}</button>
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
          <label htmlFor="cur-pw">Mật khẩu hiện tại <span className="req" aria-hidden="true">*</span></label>
          <PasswordInput id="cur-pw" value={cur} onChange={setCur} autoComplete="current-password" />
        </div>
      )}
      <div className="field">
        <label htmlFor="new-pw">Mật khẩu mới <span className="req" aria-hidden="true">*</span></label>
        <PasswordInput id="new-pw" value={next} onChange={setNext} autoComplete="new-password" minLength={8} describedBy="new-pw-hint" />
        <span id="new-pw-hint" className="hint">Từ 8 ký tự. Lưu xong, các thiết bị khác sẽ bị đăng xuất.</span>
      </div>
      {state.error && <p className="form-error" role="alert" style={{ marginTop: 0 }}>{state.error}</p>}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn primary" disabled={state.busy}>{state.busy ? "Đang lưu…" : "Lưu mật khẩu"}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>Hủy</button>
      </div>
    </form>
  );
}

export function Account() {
  const router = useRouter();
  const isNew = useSearchParams().get("moi") === "1";
  const { user, setUser, logout } = useSession();
  const [form, setForm] = useState({ displayName: "", handle: "", province: "" });
  const [state, setState] = useState<{ busy: boolean; error: string | null; saved: boolean }>({ busy: false, error: null, saved: false });

  useEffect(() => {
    if (user) setForm({ displayName: user.displayName, handle: user.handle, province: user.province ?? "" });
  }, [user]);

  if (user === undefined) return <div className="title-row"><div><h1>Tài khoản</h1><p className="sub">Đang tải…</p></div></div>;
  if (user === null)
    return (
      <>
        <div className="title-row"><div><h1>Tài khoản</h1><p className="sub">Bạn chưa đăng nhập.</p></div></div>
        <p className="empty">Đăng nhập để lưu máy vào tài khoản và có tên trên bảng xếp hạng. <Link href="/dang-nhap?next=/tai-khoan" className="card-link">Đăng nhập</Link></p>
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
          <h1>Tài khoản</h1>
          <p className="sub">{isNew ? "Tài khoản đã được tạo. Đặt tên hiển thị và tỉnh/thành để mọi người nhận ra bạn trên bảng xếp hạng." : `@${user.handle}`}</p>
        </div>
      </div>

      <div className="grid">
        <section className="panel s7" aria-labelledby="h-profile">
          <header><h2 id="h-profile">Hồ sơ</h2><span className="meta">Hiện trên bảng xếp hạng và tin rao</span></header>
          <form className="form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <div className="field">
              <label htmlFor="displayName">Tên hiển thị <span className="req" aria-hidden="true">*</span></label>
              <input id="displayName" className="input" value={form.displayName} onChange={set("displayName")} maxLength={40} required minLength={2} />
            </div>
            <div className="field">
              <label htmlFor="handle">Tên tài khoản <span className="req" aria-hidden="true">*</span></label>
              <input id="handle" className="input" value={form.handle} onChange={set("handle")} maxLength={20} aria-describedby="handle-hint"
                autoCapitalize="none" autoCorrect="off" spellCheck={false} />
              <span id="handle-hint" className="hint">3–20 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới.</span>
            </div>
            <div className="field">
              <label htmlFor="province">Tỉnh / thành</label>
              <select id="province" className="input" value={form.province} onChange={set("province")}>
                <option value="">Chưa chọn</option>
                {PROVINCES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            {state.error && <p className="form-error" role="alert">{state.error}</p>}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="btn primary" disabled={state.busy}>{state.busy ? "Đang lưu…" : "Lưu"}</button>
              {state.saved && <span className="stamp" role="status">Đã lưu</span>}
            </div>
          </form>
        </section>

        <section className="panel s5" aria-labelledby="h-signin">
          <header><h2 id="h-signin">Cách đăng nhập</h2></header>
          <ul className="rows">
            <li className="row">
              <div className="grow"><div style={{ fontWeight: 500 }}>Email và mật khẩu</div><div className="line2">{user.hasPassword ? user.email : "Chưa đặt mật khẩu"}</div></div>
              {user.hasPassword && <span className="pill pos">Đang dùng</span>}
            </li>
            <li className="row">
              <div className="grow"><div style={{ fontWeight: 500 }}>Google</div><div className="line2">{user.providers.includes("google") ? user.email : "Chưa gắn"}</div></div>
              {user.providers.includes("google") && <span className="pill pos">Đang dùng</span>}
            </li>
          </ul>
          {user.email && <PasswordForm hasPassword={user.hasPassword} onDone={setUser} />}
          <button className="btn" style={{ marginTop: 16 }} onClick={async () => { await logout(); router.push("/"); }}>Đăng xuất</button>
        </section>
      </div>
    </>
  );
}
