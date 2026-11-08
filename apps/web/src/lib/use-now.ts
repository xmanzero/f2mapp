"use client";

import { useEffect, useState } from "react";

/**
 * Giờ hiện tại, cập nhật định kỳ (mặc định 30 giây) — để trạng thái tin (mới đăng / sắp hết hạn) tự đổi.
 * null trong lần render đầu: trang tĩnh không được đọc đồng hồ lúc dựng (Next cacheComponents).
 */
export function useNow(everyMs = 30_000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
