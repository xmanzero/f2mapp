"use client";

import { computeScores, resolveMachine } from "@f2m/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SAMPLE_MACHINES } from "@/data/sample";
import { api, ApiError, type Profile } from "@/lib/api";
import { n0 } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useMachine } from "@/lib/use-machine";

interface AuthConfig { phone: { enabled: boolean; devCodeShown: boolean }; google: { clientId: string | null } }
interface LoginResult { token: string; created: boolean; user: Profile }

declare global {
  interface Window {
    google?: { accounts: { id: {
      initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }): void;
      renderButton(el: HTMLElement, o: Record<string, unknown>): void;
    } } };
  }
}

export function Login() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  const { setUser, refresh } = useSession();
  const { machine, isSample, ready } = useMachine();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [masked, setMasked] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<AuthConfig>("/v1/auth/config").then(setConfig)
      .catch(() => setError("Máy chủ tài khoản chưa sẵn sàng. Thử lại sau ít phút."));
  }, []);

  // đếm ngược nút Gửi lại mã
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

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
      window.google!.accounts.id.renderButton(googleBox.current!, { theme: "filled_black", size: "large", shape: "pill", text: "signin_with", locale: "vi", width: 300 });
    };
    if (window.google) return render();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const requestCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ phone: string; resendIn: number; devCode?: string }>("/v1/auth/otp/request", { body: { phone } });
      setMasked(r.phone);
      setDevCode(r.devCode ?? null);
      setWait(r.resendIn);
      setStep("code");
      setCode("");
    } catch (e) {
      const err = e as ApiError;
      setError(err.message);
      if (err.retryIn) setWait(err.retryIn);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await done(await api<LoginResult>("/v1/auth/otp/verify", { body: { phone, code } }));
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  // vị trí máy hiện tại trên bảng xếp hạng (để thấy lợi ích của việc đăng nhập)
  const power = ready ? computeScores(resolveMachine(machine)).power : null;
  const rank = power === null ? null
    : SAMPLE_MACHINES.filter((m) => computeScores(resolveMachine(m.machine)).power > power).length + 1;

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Đăng nhập</h1>
          <p className="sub">Bằng số điện thoại hoặc tài khoản Google. Lần đầu đăng nhập sẽ tự tạo tài khoản.</p>
        </div>
      </div>

      <div className="grid">
        <section className="panel s5" aria-labelledby="h-login">
          <header><h2 id="h-login">{step === "phone" ? "Đăng nhập bằng số điện thoại" : "Nhập mã xác nhận"}</h2></header>

          {step === "phone" ? (
            <form className="form" onSubmit={(e) => { e.preventDefault(); void requestCode(); }}>
              <div className="field">
                <label htmlFor="phone">Số di động</label>
                <input id="phone" className="input" type="tel" inputMode="tel" autoComplete="tel" required
                  value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912 345 678" aria-describedby={error ? "login-error" : undefined} />
              </div>
              <button className="btn primary block" disabled={busy || !config || wait > 0}>
                {wait > 0 ? `Gửi mã sau ${wait} giây` : busy ? "Đang gửi…" : "Gửi mã qua SMS"}
              </button>
            </form>
          ) : (
            <form className="form" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
              <div className="field">
                <label htmlFor="code">Mã 6 số gửi tới {masked}</label>
                <input id="code" className="input code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-describedby={devCode ? "dev-code" : undefined} />
              </div>
              {devCode && (
                <p id="dev-code" className="notice">
                  Chế độ thử nghiệm: máy chủ chưa gửi SMS thật. Mã của bạn là <b className="num">{devCode}</b>.
                </p>
              )}
              <button className="btn primary block" disabled={busy || code.length !== 6}>{busy ? "Đang kiểm tra…" : "Đăng nhập"}</button>
              <div className="form-links">
                <button type="button" className="link" onClick={() => { setStep("phone"); setError(null); }}>Đổi số</button>
                <button type="button" className="link" disabled={wait > 0 || busy} onClick={() => void requestCode()}>
                  {wait > 0 ? `Gửi lại mã sau ${wait} giây` : "Gửi lại mã"}
                </button>
              </div>
            </form>
          )}

          {error && <p id="login-error" className="form-error" role="alert">{error}</p>}

          <div className="or"><span>hoặc</span></div>
          {config?.google.clientId ? (
            <div ref={googleBox} className="google-box" />
          ) : (
            <p className="muted">Đăng nhập bằng Google sẽ bật khi f2m có tên miền riêng.</p>
          )}
        </section>

        <section className="panel s7" aria-labelledby="h-why">
          <header><h2 id="h-why">Khi đăng nhập</h2></header>
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
          </ul>
        </section>
      </div>
    </>
  );
}
