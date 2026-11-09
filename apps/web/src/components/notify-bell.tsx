"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { api } from "@/lib/api";
import { profilePath } from "@/lib/profile";
import { useSession } from "@/lib/session";
import { ago } from "@/lib/time";

interface Note {
  id: string; kind: "follow" | "like"; target: string | null; data: { machineName?: string }; createdAt: string; read: boolean;
  actor: { handle: string; displayName: string } | null;
}

/**
 * Chuông thông báo trên thanh trên (chỉ khi đã đăng nhập): số chưa đọc (hỏi lại mỗi phút và khi quay lại tab),
 * bấm mở danh sách — mở là đánh dấu đã đọc. Có người theo dõi → hồ sơ người đó; có người thích máy → hồ sơ của mình.
 */
export function NotifyBell() {
  const { user } = useSession();
  const { t, p, locale } = useI18n();
  const T = t.notify;
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Note[] | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const check = () => { api<{ unread: number }>("/v1/notifications/unread").then((r) => setUnread(r.unread)).catch(() => {}); };
    check();
    const timer = setInterval(check, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [user]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  if (!user) return null;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next) return;
    api<{ items: Note[]; unread: number }>("/v1/notifications").then((r) => {
      setItems(r.items);
      if (r.unread > 0) api("/v1/notifications/read", { method: "POST", body: {} }).then(() => setUnread(0)).catch(() => {});
    }).catch(() => setItems([]));
  };

  return (
    <div className="notify" ref={box}>
      <button type="button" className="notify-btn" onClick={toggle} aria-expanded={open} aria-haspopup="true"
        aria-label={unread ? T.unread(unread) : T.label}>
        <Bell aria-hidden="true" />
        {unread > 0 && <span className="notify-count num" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="notify-panel" role="dialog" aria-label={T.label}>
          <p className="notify-head">{T.label}</p>
          {items === null ? <div className="skeleton" style={{ height: 40, margin: 12 }} />
            : items.length === 0 ? <p className="muted notify-empty">{T.empty}</p>
            : (
              <ul>
                {items.map((n) => {
                  const who = n.actor?.displayName ?? "?";
                  const href = n.kind === "follow" && n.actor ? p(profilePath(n.actor.handle)) : p(profilePath(user.handle));
                  return (
                    <li key={n.id} className={n.read ? undefined : "unread"}>
                      <Link href={href} onClick={() => setOpen(false)}>
                        <span className="avatar" aria-hidden="true" style={{ background: "var(--accent)" }}>{who.trim()[0]?.toUpperCase()}</span>
                        <span className="notify-text">
                          <span>{n.kind === "follow" ? T.follow(who) : T.like(who, n.data.machineName ?? "")}</span>
                          <small className="faint">{ago(n.createdAt, locale)}</small>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
        </div>
      )}
    </div>
  );
}
