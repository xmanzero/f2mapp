"use client";

import type { MachineInput } from "@f2m/shared";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type Profile } from "./api";

interface SessionState {
  /** undefined = đang kiểm tra, null = khách */
  user: Profile | null | undefined;
  /** Máy chính lưu trên server (khi đã đăng nhập) */
  serverMachine: MachineInput | null;
  refresh: () => Promise<void>;
  setUser: (u: Profile) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null | undefined>(undefined);
  const [serverMachine, setServerMachine] = useState<MachineInput | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await api<{ user: Profile; machine: MachineInput | null }>("/v1/me");
      setUser(me.user);
      setServerMachine(me.machine);
    } catch (e) {
      // 401 = khách; lỗi khác (mất mạng, API tắt) cũng coi như khách để trang vẫn dùng được
      if (!(e instanceof ApiError) || e.status !== 401) console.warn(e);
      setUser(null);
      setServerMachine(null);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const logout = useCallback(async () => {
    await api("/v1/auth/logout", { method: "POST", body: {} }).catch(() => {});
    setUser(null);
    setServerMachine(null);
  }, []);

  return <Ctx.Provider value={{ user, serverMachine, refresh, setUser, logout }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession cần SessionProvider");
  return s;
}
