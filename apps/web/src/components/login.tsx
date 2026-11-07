"use client";

import { computeScores, resolveMachine } from "@f2m/shared";
import { Eye, EyeOff } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SAMPLE_MACHINES } from "@/data/sample";
import { api, ApiError, type Profile } from "@/lib/api";
import { n0 } from "@/lib/format";
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
  return (
    <div className="pw">
      <input id={id} className="input" type={show ? "text" : "password"} autoComplete={autoComplete} required minLength={minLength}
        value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} />
      <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={show}>
        {show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </div>
  );
}

export function Login({ initialMode = "login" }: { initialMode?: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
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
      .catch(() => setError("Máy chủ tài khoản chưa sẵn sàng. Thử lại sau ít phút."));
  }, []);

  const done = async (r: LoginResult) => {
    setUser(r.user);
    await refresh();
    router.push(r.created ? "/tai-khoan?moi=1" : next);
  };

  // Nút Google (Google Identity Services) — chỉ khi máy chủ có Client ID
  useEffect(() => {
    const clientId = config?.google.clientId;
    if (!clientId || !googleBox.current) return;
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
      window.google!.accounts.id.renderButton(googleBox.current!, { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", locale: "vi", width: 300 });
    };
    if (window.google) return render();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

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
          <h1>{mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</h1>
          <p className="sub">Bằng email và mật khẩu, hoặc tài khoản Google.</p>
        </div>
      </div>

      <div className="grid">
        <section className="panel s5" aria-labelledby="h-login">
          <header>
            <h2 id="h-login">{mode === "login" ? "Email và mật khẩu" : "Tài khoản mới"}</h2>
            <div className="segmented" role="group" aria-label="Chọn">
              <button type="button" aria-pressed={mode === "login"} onClick={() => switchMode("login")}>Đăng nhập</button>
              <button type="button" aria-pressed={mode === "register"} onClick={() => switchMode("register")}>Tạo tài khoản</button>
            </div>
          </header>

          <form className="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            {mode === "register" && (
              <div className="field">
                <label htmlFor="displayName">Tên hiển thị</label>
                <input id="displayName" className="input" autoComplete="nickname" required minLength={2} maxLength={40}
                  value={form.displayName} onChange={(e) => set("displayName")(e.target.value)} placeholder="Tên mọi người sẽ thấy" />
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" className="input" type="email" inputMode="email" autoComplete="email" required
                autoCapitalize="none" spellCheck={false} value={form.email} onChange={(e) => set("email")(e.target.value)} placeholder="ten@gmail.com" />
            </div>
            <div className="field">
              <label htmlFor="password">Mật khẩu</label>
              <PasswordInput id="password" value={form.password} onChange={set("password")}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "register" ? minLen : undefined} describedBy={mode === "register" ? "pw-hint" : undefined} />
              {mode === "register" && <span id="pw-hint" className="hint">Từ {minLen} ký tự. Nên dùng một câu dễ nhớ, khó đoán.</span>}
            </div>
            {error && <p className="form-error" role="alert" style={{ marginTop: 0 }}>{error}</p>}
            <button className="btn primary block" disabled={busy || !config}>
              {busy ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
            </button>
            {mode === "login" && (
              <p className="faint" style={{ fontSize: 13 }}>Quên mật khẩu? Tính năng lấy lại qua email sắp có. Nếu tài khoản có gắn Google, đăng nhập bằng Google rồi đặt mật khẩu mới trong trang Tài khoản.</p>
            )}
          </form>

          <div className="or"><span>hoặc</span></div>
          {config?.google.clientId ? (
            <div ref={googleBox} className="google-box" />
          ) : (
            <p className="muted">Đăng nhập bằng Google sẽ bật khi f2m có tên miền riêng.</p>
          )}
        </section>

        <section className="panel s7" aria-labelledby="h-why">
          <header><h2 id="h-why">Khi có tài khoản</h2></header>
          <ul className="rows">
            <li className="row">
              <div className="grow">
                <div style={{ fontWeight: 500 }}>Máy của bạn lên bảng xếp hạng</div>
                <div className="line2">
                  {power === null ? "Đang tính…" : isSample
                    ? "Khai báo cấu hình ở Máy của tôi, rồi đăng nhập để giữ chỗ trên bảng."
                    : `Với ${n0(power)} điểm, máy của bạn đứng thứ ${rank} trên ${SAMPLE_MACHINES.length + 1} máy hiện có.`}
                </div>
              </div>
              {power !== null && !isSample && <span className="num" style={{ fontSize: 24, fontWeight: 600 }}>#{rank}</span>}
            </li>
            <li className="row">
              <div className="grow">
                <div style={{ fontWeight: 500 }}>Cấu hình theo bạn sang máy khác</div>
                <div className="line2">Mở f2m trên điện thoại hay máy tính đều thấy đúng máy của mình. Máy đang khai báo trên trình duyệt này được lưu vào tài khoản.</div>
              </div>
            </li>
            <li className="row">
              <div className="grow">
                <div style={{ fontWeight: 500 }}>Đăng bán linh kiện cũ</div>
                <div className="line2">Khi nâng cấp, linh kiện thay ra được giữ lại để đăng bán kèm sẵn thông số và điểm (sắp có).</div>
              </div>
            </li>
            <li className="row">
              <div className="grow">
                <div style={{ fontWeight: 500 }}>Email không hiện công khai</div>
                <div className="line2">Trên bảng xếp hạng và tin rao, mọi người chỉ thấy tên hiển thị và tên tài khoản của bạn.</div>
              </div>
            </li>
            <li className="row">
              <div className="grow">
                <div style={{ fontWeight: 500 }}>Mật khẩu được băm một chiều</div>
                <div className="line2">f2m không lưu mật khẩu gốc. Nhập sai 5 lần, tài khoản tạm khóa 15 phút để chặn dò mật khẩu.</div>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
