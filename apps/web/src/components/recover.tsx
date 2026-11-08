"use client";

import { useI18n } from "@/i18n/client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, type Profile } from "@/lib/api";
import { useSession } from "@/lib/session";
import { PasswordInput } from "./login";

const Title = ({ h, sub }: { h: string; sub: string }) => (
  <div className="title-row"><div><h1>{h}</h1><p className="sub">{sub}</p></div></div>
);

/** /quen-mat-khau — nhập email, máy chủ gửi link đặt lại (luôn trả cùng một câu) */
export function ForgotPassword() {
  const { t, p } = useI18n();
  const T = t.recover;
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setError(null);
    try { setSent((await api<{ message: string }>("/v1/auth/forgot", { body: { email } })).message); }
    catch (e) { setError((e as ApiError).message); }
    setBusy(false);
  };
  return (
    <>
      <Title h={t.pages.forgotPassword} sub={T.forgotSub} />
      <section className="panel recover" aria-labelledby="h-forgot">
        <h2 id="h-forgot" className="sr-only">{T.sendLink}</h2>
        {sent ? (
          <div className="recover-done" role="status">
            <p>{sent}</p>
            <p className="muted">{T.notReceived}</p>
            <div className="recover-actions">
              <button type="button" className="btn" onClick={() => setSent(null)}>{T.resend}</button>
              <Link href={p("/dang-nhap")} className="btn primary">{T.toLogin}</Link>
            </div>
          </div>
        ) : (
          <form className="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <div className="field">
              <label htmlFor="fp-email">Email</label>
              <input id="fp-email" className="input" type="email" inputMode="email" autoComplete="email" required autoCapitalize="none" spellCheck={false}
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.common.emailPh} />
            </div>
            {error && <p className="form-error" role="alert" style={{ marginTop: 0 }}>{error}</p>}
            <button className="btn primary block" disabled={busy || !email}>{busy ? T.sending : T.send}</button>
            <p style={{ fontSize: 14 }}><Link href={p("/dang-nhap")} className="card-link">{T.backToLogin}</Link></p>
          </form>
        )}
      </section>
    </>
  );
}

/** /dat-lai-mat-khau?t=… — đặt mật khẩu mới, xong thì đăng nhập luôn */
export function ResetPassword() {
  const token = useSearchParams().get("t") ?? "";
  const router = useRouter();
  const { setUser, refresh } = useSession();
  const { t, p } = useI18n();
  const T = t.recover;
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; expired: boolean } | null>(null);

  const submit = async () => {
    if (pw !== pw2) { setError({ text: T.mismatch, expired: false }); return; }
    setBusy(true); setError(null);
    try {
      const r = await api<{ user: Profile }>("/v1/auth/reset", { body: { token, password: pw } });
      setUser(r.user); await refresh();
      router.push(p("/may"));
    } catch (e) {
      const err = e as ApiError;
      setError({ text: err.message, expired: err.code === "bad_token" });
      setBusy(false);
    }
  };

  if (!token) return (
    <>
      <Title h={t.pages.resetPassword} sub={T.noToken} />
      <p className="empty"><Link href={p("/quen-mat-khau")} className="card-link">{T.newRequest}</Link></p>
    </>
  );
  return (
    <>
      <Title h={T.newPwTitle} sub={T.newPwSub} />
      <section className="panel recover" aria-labelledby="h-reset">
        <h2 id="h-reset" className="sr-only">{T.newPw}</h2>
        <form className="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="field">
            <label htmlFor="rp-1">{T.newPw}</label>
            <PasswordInput id="rp-1" value={pw} onChange={setPw} autoComplete="new-password" minLength={8} describedBy="rp-hint" />
            <span id="rp-hint" className="hint">{T.pwHint}</span>
          </div>
          <div className="field">
            <label htmlFor="rp-2">{T.repeat}</label>
            <PasswordInput id="rp-2" value={pw2} onChange={setPw2} autoComplete="new-password" minLength={8} />
          </div>
          {error && (
            <p className="form-error" role="alert" style={{ marginTop: 0 }}>
              {error.text}{error.expired && <> <Link href={p("/quen-mat-khau")} className="card-link">{T.newRequestShort}</Link></>}
            </p>
          )}
          <button className="btn primary block" disabled={busy || !pw || !pw2}>{busy ? t.common.saving : T.savePw}</button>
        </form>
      </section>
    </>
  );
}

/** /xac-minh-email?t=… — tự xác minh khi mở trang */
export function VerifyEmailLanding() {
  const token = useSearchParams().get("t") ?? "";
  const { user, refresh } = useSession();
  const { t, p } = useI18n();
  const T = t.recover;
  const [result, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const state = token ? result : { ok: false, text: T.noToken };
  const once = useRef(false);
  useEffect(() => {
    if (once.current || !token) return;
    once.current = true;
    api<{ email: string }>("/v1/auth/verify-email", { body: { token } })
      .then((r) => { setState({ ok: true, text: T.verifiedEmail(r.email) }); void refresh(); })
      .catch((e: ApiError) => setState({ ok: false, text: e.message }));
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, refresh]);

  return (
    <>
      <Title h={t.pages.verifyEmail} sub={state ? state.text : T.verifying} />
      {state && (
        <section className="panel recover" aria-live="polite">
          <p>{state.ok ? T.verifiedText : T.failedText}</p>
          <div className="recover-actions">
            {user ? <Link href={p(state.ok ? "/may" : "/tai-khoan")} className="btn primary">{state.ok ? T.openMachine : T.openAccount}</Link>
              : <Link href={`${p("/dang-nhap")}?next=${state.ok ? "/may" : "/tai-khoan"}`} className="btn primary">{t.common.login}</Link>}
          </div>
        </section>
      )}
    </>
  );
}
