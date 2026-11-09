"use client";

import { localizePartLabel } from "@f2m/shared";
import { ArrowLeft, ImageIcon, ImagePlus, Send } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { personTint } from "@/data/sample";
import { useI18n } from "@/i18n/client";
import { api, ApiError } from "@/lib/api";
import { listingPath } from "@/lib/listing-url";
import { pageLocale } from "@/i18n/config";
import { photoUrl, shrinkImage } from "@/lib/photos";
import { UserSafetyMenu } from "./user-safety";
import { profilePath } from "@/lib/profile";
import { useSession } from "@/lib/session";
import { ago } from "@/lib/time";

interface Conv {
  id: string; lastMessageAt: string; unread: number;
  other: { handle: string; displayName: string; banned: boolean };
  listing: { id: string; name: string; priceVnd: number | null; status: string | null; province: string | null; photo: string | null } | null;
  last: { body: string; mine: boolean; image?: boolean } | null;
  /** chỉ có khi mở hội thoại */
  blocked?: boolean; canSend?: boolean;
}
interface Msg { id: string; body: string; createdAt: string; mine: boolean; read: boolean; image: { id: string; width: number; height: number } | null }
const imageUrl = (id: string) => `/api/v1/messages/images/${id}`;

/** Gửi ảnh (thân yêu cầu là tệp ảnh đã thu nhỏ trên trình duyệt; máy chủ đổi sang WebP) */
async function uploadImage(conversationId: string, blob: Blob): Promise<Msg> {
  const res = await fetch(`/api/v1/conversations/${conversationId}/images`, {
    method: "POST", headers: { "content-type": blob.type || "image/jpeg", "x-lang": pageLocale() }, body: blob, credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message ?? String(res.status), data.error);
  return data.message as Msg;
}

const POLL_THREAD = 5_000, POLL_LIST = 20_000;
const initialOf = (n: string) => n.trim()[0]?.toUpperCase() ?? "?";

/** Hộp thư /tin-nhan: danh sách hội thoại + nội dung (?c=<id>). Điện thoại: chọn hội thoại thì chỉ hiện nội dung. */
export function Inbox() {
  const { user } = useSession();
  const { t, p } = useI18n();
  const T = t.msg;
  const router = useRouter();
  const current = useSearchParams().get("c");
  const [list, setList] = useState<Conv[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(() => {
    api<{ items: Conv[] }>("/v1/conversations").then((r) => setList(r.items)).catch((e: ApiError) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!user) return;
    loadList();
    const timer = setInterval(loadList, POLL_LIST);
    return () => clearInterval(timer);
  }, [user, loadList]);

  const head = <div className="title-row inbox-title"><div><h1>{T.title}</h1>{user === null && <p className="sub">{T.login}</p>}</div></div>;
  if (user === undefined) return head;
  if (user === null) return <>{head}<p className="empty"><Link href={`${p("/dang-nhap")}?next=/tin-nhan`} className="btn primary">{t.common.login}</Link></p></>;
  if (error) return <>{head}<p className="form-error">{error}</p></>;
  const open = (id: string) => router.replace(`${p("/tin-nhan")}?c=${id}`, { scroll: false });

  return (
    <>
      {head}
      <div className={`inbox${current ? " has-thread" : ""}`}>
        <section className="panel inbox-list" aria-label={T.title}>
          {list === null ? [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 56, marginTop: i ? 8 : 0 }} />)
            : list.length === 0 ? <p className="muted">{T.empty}</p>
            : (
              <ul>
                {list.map((c) => <ConvRow key={c.id} c={c} active={c.id === current} onOpen={() => open(c.id)} />)}
              </ul>
            )}
        </section>
        <section className="panel inbox-thread" aria-live="polite">
          {current ? <Thread key={current} id={current} onSent={loadList} onBack={() => router.replace(p("/tin-nhan"), { scroll: false })} />
            : <p className="muted inbox-pick">{T.pick}</p>}
        </section>
      </div>
    </>
  );
}

function ConvRow({ c, active, onOpen }: { c: Conv; active: boolean; onOpen: () => void }) {
  const { t, locale } = useI18n();
  return (
    <li>
      <button type="button" className={`conv${active ? " active" : ""}${c.unread ? " unread" : ""}`} onClick={onOpen} aria-current={active || undefined}>
        <span className="avatar" aria-hidden="true" style={{ background: personTint(c.other.displayName) }}>{initialOf(c.other.displayName)}</span>
        <span className="conv-body">
          <span className="conv-top"><b>{c.other.displayName}</b><small className="faint">{ago(c.lastMessageAt, locale)}</small></span>
          {c.listing && <small className="conv-listing">{localizePartLabel(c.listing.name, locale)}</small>}
          <span className="conv-last">{c.last?.mine ? t.msg.you : ""}{c.last?.image && !c.last.body ? <><ImageIcon size={13} aria-hidden="true" className="conv-photo" /> {t.msg.photo}</> : c.last?.body}</span>
        </span>
        {c.unread > 0 && <span className="conv-count num" aria-label={t.msg.unread(c.unread)}>{c.unread}</span>}
      </button>
    </li>
  );
}

function Thread({ id, onSent, onBack }: { id: string; onSent: () => void; onBack: () => void }) {
  const { t, p, vnd, locale } = useI18n();
  const T = t.msg;
  const [conv, setConv] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const last = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    api<{ conversation: Conv; messages: Msg[]; hasMore: boolean }>(`/v1/conversations/${id}`).then((r) => {
      if (!live) return;
      setConv(r.conversation); setMsgs(r.messages); setHasMore(r.hasMore);
      last.current = r.messages.at(-1)?.createdAt ?? null;
      onSent(); // cập nhật số chưa đọc trong danh sách
    }).catch((e: ApiError) => { if (live) setError(e.message); });
    // tin mới của người kia
    const timer = setInterval(() => {
      const after = last.current ? `?after=${encodeURIComponent(last.current)}` : "";
      api<{ messages: Msg[] }>(`/v1/conversations/${id}${after}`).then((r) => {
        if (!live || !r.messages.length) return;
        setMsgs((m) => [...m, ...r.messages.filter((x) => !m.some((y) => y.id === x.id))]);
        last.current = r.messages.at(-1)!.createdAt;
      }).catch(() => {});
    }, POLL_THREAD);
    return () => { live = false; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ message: Msg }>(`/v1/conversations/${id}/messages`, { method: "POST", body: { body } });
      setMsgs((m) => [...m, r.message]);
      last.current = r.message.createdAt;
      setText("");
      onSent();
    } catch (e) { setError((e as ApiError).message); }
    setBusy(false);
  };
  const sendPhoto = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true); setError(null);
    try {
      const m = await uploadImage(id, await shrinkImage(f, 1600));
      setMsgs((x) => [...x, m]);
      last.current = m.createdAt;
      onSent();
    } catch (e) { setError((e as Error).message); }
    setUploading(false);
    if (file.current) file.current.value = "";
  };
  const older = async () => {
    if (!msgs[0]) return;
    const r = await api<{ messages: Msg[]; hasMore: boolean }>(`/v1/conversations/${id}?before=${encodeURIComponent(msgs[0].createdAt)}`);
    setMsgs((m) => [...r.messages, ...m]); setHasMore(r.hasMore);
  };

  if (error && !conv) return <p className="form-error">{error}</p>;
  if (!conv) return <div className="skeleton" style={{ height: 120 }} />;
  const l = conv.listing;
  return (
    <div className="thread">
      <header className="thread-head">
        <button type="button" className="icon-btn thread-back" onClick={onBack} aria-label={T.back}><ArrowLeft aria-hidden="true" /></button>
        <Link href={p(profilePath(conv.other.handle))} className="thread-who">
          <span className="avatar" aria-hidden="true" style={{ background: personTint(conv.other.displayName) }}>{initialOf(conv.other.displayName)}</span>
          <span><b>{conv.other.displayName}</b><small className="faint"> @{conv.other.handle}</small></span>
        </Link>
        <UserSafetyMenu handle={conv.other.handle} name={conv.other.displayName} blocked={!!conv.blocked} conversationId={id}
          onBlocked={(b) => setConv((c) => c && ({ ...c, blocked: b, canSend: !b && !c.other.banned }))} />
      </header>
      {l && (
        <Link href={p(listingPath({ id: l.id, name: l.name, province: l.province }))} className="thread-listing">
          {l.photo && (
            <span className="thumb" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(l.photo)} alt="" />
            </span>
          )}
          <span className="grow"><small className="faint">{T.about}</small><br /><b>{localizePartLabel(l.name, locale)}</b></span>
          <span className="num">{l.status === "sold" ? T.sold : l.status === "active" || l.status === "reserved" ? (l.priceVnd ? vnd(l.priceVnd) : "") : T.gone}</span>
        </Link>
      )}
      <div className="thread-msgs">
        {hasMore && <button type="button" className="btn small" onClick={older}>{T.older}</button>}
        {msgs.length === 0 && <p className="muted thread-first">{T.first(conv.other.displayName)}</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`bubble${m.mine ? " mine" : ""}${m.image ? " has-image" : ""}`}>
            {m.image && (
              <a href={imageUrl(m.image.id)} target="_blank" rel="noopener" className="bubble-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl(m.image.id)} alt={T.photo} width={m.image.width} height={m.image.height} loading="lazy" />
              </a>
            )}
            {m.body && <p>{m.body}</p>}
            <small className="faint">{ago(m.createdAt, locale)}</small>
          </div>
        ))}
        <div ref={end} />
      </div>
      {conv.other.banned ? <p className="muted thread-closed">{T.banned}</p>
        : conv.canSend === false ? <p className="muted thread-closed">{conv.blocked ? t.safety.blockedYou : t.safety.cannotSend}</p> : (
        <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void sendPhoto(e.target.files?.[0])} />
          <button type="button" className="icon-btn composer-photo" aria-label={uploading ? T.uploading : T.sendPhoto} title={T.sendPhoto}
            disabled={uploading} onClick={() => file.current?.click()}><ImagePlus aria-hidden="true" /></button>
          <textarea value={text} rows={2} maxLength={2000} placeholder={T.placeholder} aria-label={T.placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
          <button className="btn primary" disabled={busy || !text.trim()} aria-label={T.send}><Send size={16} aria-hidden="true" /><span className="composer-label">{busy ? T.sending : T.send}</span></button>
        </form>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
