import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface GoogleProfile {
  sub: string;
  email: string | null;
  name: string | null;
}

export type GoogleVerifier = (idToken: string) => Promise<GoogleProfile>;

const GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";

/**
 * Xác thực ID token do nút "Đăng nhập bằng Google" (web) hoặc expo-auth-session (app) trả về.
 * `clientIds`: Client ID của web, Android, iOS (token phải có aud là một trong số đó).
 * `keys` chỉ truyền khi test; mặc định lấy khóa công khai của Google.
 */
export function createGoogleVerifier(clientIds: string[], keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(GOOGLE_JWKS))): GoogleVerifier {
  return async (idToken) => {
    const { payload } = await jwtVerify(idToken, keys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientIds,
    });
    if (typeof payload.sub !== "string") throw new Error("Token không có sub");
    const email = typeof payload.email === "string" && payload.email_verified === true ? payload.email : null;
    return { sub: payload.sub, email, name: typeof payload.name === "string" ? payload.name : null };
  };
}
