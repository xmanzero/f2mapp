"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "f2m.theme";

/** Chế độ đang hiển thị: lựa chọn đã lưu, nếu chưa có thì theo hệ điều hành */
function current(): Theme {
  const set = document.documentElement.getAttribute("data-theme");
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Nút Ngày / Đêm. Lần đầu theo hệ điều hành; bấm thì ghi nhớ trên trình duyệt. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    setTheme(current());
    // chưa chọn thì đổi theo hệ điều hành khi hệ điều hành đổi
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setTheme(current());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const next: Theme = theme === "light" ? "dark" : "light";
  const toggle = () => {
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(KEY, next); } catch { /* trình duyệt chặn lưu: vẫn đổi trong phiên này */ }
    setTheme(next);
  };

  return (
    <button type="button" className="theme-toggle" onClick={toggle} disabled={!theme}
      aria-label={theme === "light" ? "Chuyển sang chế độ Đêm" : "Chuyển sang chế độ Ngày"}
      title={theme === "light" ? "Chế độ Đêm" : "Chế độ Ngày"}>
      {theme === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
    </button>
  );
}
