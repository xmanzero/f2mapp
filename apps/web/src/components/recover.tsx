"use client";

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
      <Title h="Quên mật khẩu" sub="Nhập email đã đăng ký, pcdex gửi link để đặt mật khẩu mới." />
      <section className="panel recover" aria-labelledby="h-forgot">
        <h2 id="h-forgot" className="sr-only">Gửi link đặt lại mật khẩu</h2>
        {sent ? (
          <div className="recover-done" role="status">
            <p>{sent}</p>
            <p className="muted">Không nhận được thư sau vài phút? Kiểm tra lại địa chỉ email rồi gửi lại. Tài khoản tạo bằng Google thì đăng nhập bằng Google.</p>
            <div className="recover-actions">
              <button type="button" className="btn" onClick={() => setSent(null)}>Gửi lại</button>
              <Link href="/dang-nhap" className="btn primary">Về trang đăng nhập</Link>
            </div>
          </div>
        ) : (
          <form className="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <div className="field">
              <label htmlFor="fp-email">Email</label>
              <input id="fp-email" className="input" type="email" inputMode="email" autoComplete="email" required autoCapitalize="none" spellCheck={false}
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@gmail.com" />
            </div>
            {error && <p className="form-error" role="alert" style={{ marginTop: 0 }}>{error}</p>}
            <button className="btn primary block" disabled={busy || !email}>{busy ? "Đang gửi…" : "Gửi link đặt lại"}</button>
            <p style={{ fontSize: 14 }}><Link href="/dang-nhap" className="card-link">Quay lại đăng nhập</Link></p>
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
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; expired: boolean } | null>(null);

  const submit = async () => {
    if (pw !== pw2) { setError({ text: "Hai lần nhập mật khẩu chưa giống nhau.", expired: false }); return; }
    setBusy(true); setError(null);
    try {
      const r = await api<{ user: Profile }>("/v1/auth/reset", { body: { token, password: pw } });
      setUser(r.user); await refresh();
      router.push("/may");
    } catch (e) {
      const err = e as ApiError;
      setError({ text: err.message, expired: err.code === "bad_token" });
      setBusy(false);
    }
  };

  if (!token) return (
    <>
      <Title h="Đặt lại mật khẩu" sub="Link chưa đúng: thiếu mã trong đường dẫn." />
      <p className="empty"><Link href="/quen-mat-khau" className="card-link">Gửi yêu cầu đặt lại mật khẩu mới</Link></p>
    </>
  );
  return (
    <>
      <Title h="Đặt mật khẩu mới" sub="Đặt xong bạn được đăng nhập luôn; các thiết bị khác bị đăng xuất." />
      <section className="panel recover" aria-labelledby="h-reset">
        <h2 id="h-reset" className="sr-only">Mật khẩu mới</h2>
        <form className="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="field">
            <label htmlFor="rp-1">Mật khẩu mới</label>
            <PasswordInput id="rp-1" value={pw} onChange={setPw} autoComplete="new-password" minLength={8} describedBy="rp-hint" />
            <span id="rp-hint" className="hint">Từ 8 ký tự. Nên dùng một câu dễ nhớ, khó đoán.</span>
          </div>
          <div className="field">
            <label htmlFor="rp-2">Nhập lại mật khẩu mới</label>
            <PasswordInput id="rp-2" value={pw2} onChange={setPw2} autoComplete="new-password" minLength={8} />
          </div>
          {error && (
            <p className="form-error" role="alert" style={{ marginTop: 0 }}>
              {error.text}{error.expired && <> <Link href="/quen-mat-khau" className="card-link">Gửi yêu cầu mới</Link></>}
            </p>
          )}
          <button className="btn primary block" disabled={busy || !pw || !pw2}>{busy ? "Đang lưu…" : "Lưu mật khẩu mới"}</button>
        </form>
      </section>
    </>
  );
}

/** /xac-minh-email?t=… — tự xác minh khi mở trang */
export function VerifyEmailLanding() {
  const token = useSearchParams().get("t") ?? "";
  const { user, refresh } = useSession();
  const [result, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const state = token ? result : { ok: false, text: "Link chưa đúng: thiếu mã trong đường dẫn." };
  const once = useRef(false);
  useEffect(() => {
    if (once.current || !token) return;
    once.current = true;
    api<{ email: string }>("/v1/auth/verify-email", { body: { token } })
      .then((r) => { setState({ ok: true, text: `Đã xác minh ${r.email}.` }); void refresh(); })
      .catch((e: ApiError) => setState({ ok: false, text: e.message }));
  }, [token, refresh]);

  return (
    <>
      <Title h="Xác minh email" sub={state ? state.text : "Đang xác minh…"} />
      {state && (
        <section className="panel recover" aria-live="polite">
          <p>{state.ok
            ? "Email này giờ dùng được để lấy lại mật khẩu, và tài khoản của bạn được bảo vệ tốt hơn."
            : "Mỗi link dùng được một lần, hiệu lực 48 giờ. Gửi thư mới ở trang Tài khoản."}</p>
          <div className="recover-actions">
            {user ? <Link href={state.ok ? "/may" : "/tai-khoan"} className="btn primary">{state.ok ? "Mở Máy của tôi" : "Mở trang Tài khoản"}</Link>
              : <Link href={`/dang-nhap?next=${state.ok ? "/may" : "/tai-khoan"}`} className="btn primary">Đăng nhập</Link>}
          </div>
        </section>
      )}
    </>
  );
}
