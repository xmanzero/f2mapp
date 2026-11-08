"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Profile } from "./api";
import { useSession } from "./session";

/** Khu vực lọc ở Chợ linh kiện: tên tỉnh / thành, hoặc "all" = toàn quốc */
export type Region = string;
export const ALL: Region = "all";
const COOKIE = "f2m_region";

function readCookie(): Region | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}
function writeCookie(v: Region) {
  document.cookie = `${COOKIE}=${encodeURIComponent(v)}; path=/; max-age=${365 * 86400}; samesite=lax`;
}

export type RegionSource = "saved" | "home" | "last_listing" | "default";

/**
 * Khu vực đang lọc. Thứ tự: đã lưu (tài khoản, rồi cookie) → nơi người dùng sống → tỉnh của tin đăng gần nhất → toàn quốc.
 * Đổi khu vực: lưu cookie; đã đăng nhập thì lưu cả vào tài khoản (sang máy khác vẫn nhớ).
 */
export function useMarketRegion() {
  const { user, setUser } = useSession();
  const [region, setRegionState] = useState<Region | null>(null);
  const [source, setSource] = useState<RegionSource>("default");

  useEffect(() => {
    if (user === undefined) return;
    const cookie = readCookie();
    const pick: [Region | null | undefined, RegionSource][] = [
      [user?.marketRegion, "saved"], [cookie, "saved"], [user?.province, "home"], [user?.lastListingProvince, "last_listing"],
    ];
    const [v, s] = pick.find(([x]) => !!x) ?? [ALL, "default"];
    setRegionState(v!); setSource(s);
  }, [user]);

  const setRegion = useCallback((v: Region) => {
    setRegionState(v); setSource("saved");
    writeCookie(v);
    if (user) api<{ user: Profile }>("/v1/me", { method: "PATCH", body: { marketRegion: v } }).then((r) => setUser(r.user)).catch(() => {});
  }, [user, setUser]);

  return { region, setRegion, source };
}
