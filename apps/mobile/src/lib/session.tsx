import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setApiToken } from "./api";
import { storage } from "./storage";

export interface User { id: string; handle: string; displayName: string; email: string | null; province: string | null; role: string }

const KEY = "f2m.token";
interface Session {
  /** undefined = đang tải, null = khách */
  user: User | null | undefined;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}
const Ctx = createContext<Session>({ user: undefined, login: async () => {}, register: async () => {}, logout: async () => {} });

/** Phiên đăng nhập: token lưu trong SecureStore, gửi qua header Authorization (API nhận cả cookie của web lẫn Bearer của app) */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      const token = await storage.get(KEY);
      if (!token) { setUser(null); return; }
      setApiToken(token);
      try { setUser((await api<{ user: User }>("/v1/me")).user); }
      catch { setApiToken(null); await storage.remove(KEY); setUser(null); }
    })();
  }, []);

  const signedIn = useCallback(async (r: { token: string; user: User }) => {
    setApiToken(r.token);
    await storage.set(KEY, r.token);
    setUser(r.user);
  }, []);
  const value = useMemo<Session>(() => ({
    user,
    login: async (email, password) => signedIn(await api("/v1/auth/login", { body: { email, password } })),
    register: async (email, password, displayName) => signedIn(await api("/v1/auth/register", { body: { email, password, displayName } })),
    logout: async () => {
      await api("/v1/auth/logout", { body: {} }).catch(() => {});
      setApiToken(null);
      await storage.remove(KEY);
      setUser(null);
    },
  }), [user, signedIn]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
