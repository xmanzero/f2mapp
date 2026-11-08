"use client";

import { useI18n } from "@/i18n/client";

import { computeScores, resolveMachine } from "@f2m/shared";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SAMPLE_MACHINES } from "@/data/sample";
import { api, ApiError, type Profile } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useMachine } from "@/lib/use-machine";

interface AuthConfig { password: { enabled: boolean; minLength: number }; google: { clientId: string | null } }
interface LoginResult { token: string; created: boolean; user: Profile }

declare global {
  interface Window {
    google?: { accounts: { id: {
      initialize(o: { client_id: string; callback: (r: { credential: string }) => void }): void;
      renderButton(el: HTMLElement, o: Record<string, unknown>): void;
    } } };
  }
}

export function PasswordInput({ id, value, onChange, autoComplete, describedBy, minLength }: {
  id: string; value: string; onChange: (v: string) => void; autoComplete: string; describedBy?: string; minLength?: number;
}) {
  const [show, setShow] = useState(false);
  const { t } = useI18n();
  return (
    <div className="pw">
      <input id={id} className="input" type={show ? "text" : "password"} autoComplete={autoComplete} required minLength={minLength}
        value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} />
      <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? t.login.hidePw : t.login.showPw} aria-pressed={show}>
        {show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </div>
  );
}

export function Login({ initialMode = "login" }: { initialMode?: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const { t, p, n0, locale } = useI18n();
  const T = t.login;
  const next = params.get("next") ?? "/may";
  const { setUser, refresh } = useSession();
  const { machine, isSample, ready } = useMachine();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [mode, setMode] = useState<"login" | "register">(params.get("tao") === "1" ? "register" : initialMode);
  const [form, setForm] = useState({ email: "", password: "", displayName: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<AuthConfig>("/v1/auth/config").then(setConfig)
      .catch(() => setError(t.login.serverDown));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = async (r: LoginResult) => {
    setUser(r.user);
    await refresh();
    router.push(r.created ? `${p("/tai-khoan")}?moi=1` : p(next));
  };

  // Google chỉ cho phép nguồn HTTPS (hoặc localhost): vào bằng IP LAN qua http thì ẩn nút, chỉ đường sang pcdex.app
  const [secureOrigin, setSecureOrigin] = useState(false);
  useEffect(() => { setSecureOrigin(location.protocol === "https:" || location.hostname === "localhost"); }, []);

  // Nút Google (Google Identity Services) — chỉ khi máy chủ có Client ID
  useEffect(() => {
    const clientId = config?.google.clientId;
    if (!clientId || !secureOrigin || !googleBox.current) return;
    const render = () => {
      window.google!.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }) => {
          setBusy(true);
          setError(null);
          api<LoginResult>("/v1/auth/google", { body: { idToken: credential } }).then(done)
            .catch((e: ApiError) => setError(e.message)).finally(() => setBusy(false));
        },
      });
      window.google!.accounts.id.renderButton(googleBox.current!, { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", locale, width: 300 });
    };
    if (window.google) return render();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, secureOrigin]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await done(mode === "login"
        ? await api<LoginResult>("/v1/auth/login", { body: { email: form.email, password: form.password } })
        : await api<LoginResult>("/v1/auth/register", { body: form }));
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const switchMode = (m: "login" | "register") => { setMode(m); setError(null); };

  // vị trí máy hiện tại trên bảng xếp hạng (để thấy lợi ích của việc đăng nhập)
  const power = ready ? computeScores(resolveMachine(machine)).power : null;
  const rank = power === null ? null
    : SAMPLE_MACHINES.filter((m) => computeScores(resolveMachine(m.machine)).power > power).length + 1;
  const minLen = config?.password.minLength ?? 8;

  return (
    <>
      <div className="title-row">
        <div>
          <h1>{mode === "login" ? t.common.login : t.common.signupFree}</h1>
          <p className="sub">{T.sub}</p>
        </div>
      </div>

      <div className="grid">
        <section className="panel s5" aria-labelledby="h-login">
          <header>
            <h2 id="h-login">{mode === "login" ? T.emailPw : T.newAccount}</h2>
            <div className="segmented" role="group" aria-label={T.choose}>
              <button type="button" aria-pressed={mode === "login"} onClick={() => switchMode("login")}>{t.common.login}</button>
              <button type="button" aria-pressed={mode === "register"} onClick={() => switchMode("register")}>{t.common.signupFree}</button>
            </div>
          </header>

          <form className="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            {mode === "register" && (
              <div className="field">
                <label htmlFor="displayName">{T.displayName} <span className="req" aria-hidden="true">*</span></label>
                <input id="displayName" className="input" autoComplete="nickname" required minLength={2} maxLength={40}
                  value={form.displayName} onChange={(e) => set("displayName")(e.target.value)} placeholder={T.displayNamePh} />
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Email <span className="req" aria-hidden="true">*</span></label>
              <input id="email" className="input" type="email" inputMode="email" autoComplete="email" required
                autoCapitalize="none" spellCheck={false} value={form.email} onChange={(e) => set("email")(e.target.value)} placeholder={t.common.emailPh} />
            </div>
            <div className="field">
              <label htmlFor="password">{T.password} <span className="req" aria-hidden="true">*</span></label>
              <PasswordInput id="password" value={form.password} onChange={set("password")}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "register" ? minLen : undefined} describedBy={mode === "register" ? "pw-hint" : undefined} />
              {mode === "register" && <span id="pw-hint" className="hint">{T.pwHint(minLen)}</span>}
            </div>
            {error && <p className="form-error" role="alert" style={{ marginTop: 0 }}>{error}</p>}
            <button className="btn primary block" disabled={busy || !config}>
              {busy ? T.working : mode === "login" ? t.common.login : t.common.signupFree}
            </button>
            {mode === "login" && (
              <p style={{ fontSize: 14 }}><Link href={p("/quen-mat-khau")} className="card-link">{T.forgot}</Link></p>
            )}
          </form>

          <div className="or"><span>{t.common.or}</span></div>
          {config?.google.clientId && secureOrigin ? (
            <div ref={googleBox} className="google-box" />
          ) : config?.google.clientId ? (
            <p className="muted">{T.googleElsewhere(<a href={`https://pcdex.app${p("/dang-nhap")}`} className="card-link">pcdex.app</a>)}</p>
          ) : (
            <p className="muted">{T.googleOff}</p>
          )}
        </section>

        <section className="panel s7" aria-labelledby="h-why">
          <header><h2 id="h-why">{T.why}</h2></header>
          <ul className="rows">
            <li className="row">
              <div className="grow">
                <div style={{ fontWeight: 500 }}>{T.w1}</div>
                <div className="line2">
                  {power === null ? T.computing : isSample ? T.w1Sample : T.w1Rank(n0(power), rank!, SAMPLE_MACHINES.length + 1)}
                </div>
              </div>
              {power !== null && !isSample && <span className="num" style={{ fontSize: 24, fontWeight: 600 }}>#{rank}</span>}
            </li>
            <li className="row">
              <div className="grow">
                <div style={{ fontWeight: 500 }}>{T.w2}</div>
                <div className="line2">{T.w2Text}</div>
              </div>
            </li>
            <li className="row">
              <div className="grow">
                <div style={{ fontWeight: 500 }}>{T.w3}</div>
                <div className="line2">{T.w3Text}</div>
              </div>
            </li>
            <li className="row">
              <div className="grow">
                <div style={{ fontWeight: 500 }}>{T.w4}</div>
                <div className="line2">{T.w4Text}</div>
              </div>
            </li>
            <li className="row">
              <div className="grow">
                <div style={{ fontWeight: 500 }}>{T.w5}</div>
                <div className="line2">{T.w5Text}</div>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
