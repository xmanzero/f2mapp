"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

/** Biểu tượng tin nhắn trên thanh trên (đã đăng nhập): số tin chưa đọc, hỏi lại mỗi 30 giây và khi quay lại tab */
export function MessageLink() {
  const { user } = useSession();
  const { t, p } = useI18n();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!user) return;
    const check = () => { api<{ unread: number }>("/v1/messages/unread").then((r) => setUnread(r.unread)).catch(() => {}); };
    check();
    const timer = setInterval(check, 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [user]);
  if (!user) return null;
  return (
    <Link href={p("/tin-nhan")} className="notify-btn msg-link" aria-label={unread ? t.msg.unread(unread) : t.msg.label}>
      <MessageCircle aria-hidden="true" />
      {unread > 0 && <span className="notify-count num" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
    </Link>
  );
}
