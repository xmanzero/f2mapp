"use client";

import { isLaptop, localizePartLabel, partLabel, TIERS, tierName, type PartKind } from "@f2m/shared";
import { Heart } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import { api, ApiError } from "@/lib/api";
import { listingPath } from "@/lib/listing-url";
import { photoUrl } from "@/lib/photos";
import { profilePath, type FollowRow, type ProfileMachine, type PublicProfile } from "@/lib/profile";
import { useSession } from "@/lib/session";
import { personTint } from "@/data/sample";
import { TierEmblem, tierVars } from "./tier";

const initialOf = (name: string) => name.trim()[0]?.toUpperCase() ?? "?";

/**
 * Hồ sơ công khai /u/<tên>: người dùng, các máy (điểm, hạng, linh kiện đã xác thực, số đo, lượt thích), tin đang bán,
 * người theo dõi / đang theo dõi. `initial`: bản máy chủ đã dựng (khách); trình duyệt tải lại để biết đã theo dõi / đã thích chưa.
 */
export function Profile({ initial }: { initial: PublicProfile }) {
  const { t, p, n0, date, vnd, locale } = useI18n();
  const T = t.profile;
  const { user } = useSession();
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<"followers" | "following" | null>(null);
  const handle = initial.user.handle;

  useEffect(() => {
    if (user === undefined) return;
    api<PublicProfile>(`/v1/users/${encodeURIComponent(handle)}`).then(setData).catch(() => {});
  }, [handle, user]);

  const u = data.user;
  const toggleFollow = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<{ following: boolean; followers: number }>(`/v1/users/${encodeURIComponent(handle)}/follow`, { method: data.following ? "DELETE" : "POST", body: {} });
      setData((d) => ({ ...d, following: r.following, followers: r.followers }));
    } catch (e) { setError((e as ApiError).message); }
    setBusy(false);
  };
  const setMachine = (id: string, patch: Partial<ProfileMachine>) =>
    setData((d) => ({ ...d, machines: d.machines.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));

  return (
    <>
      <div className="title-row profile-head">
        <div className="profile-who">
          <span className="avatar avatar-lg" aria-hidden="true">{initialOf(u.displayName)}</span>
          <div style={{ minWidth: 0 }}>
            <h1>{u.displayName}</h1>
            <p className="sub">@{u.handle}{u.province ? ` · ${u.province}` : ""} · {T.joined(date(u.joinedAt))}</p>
            <p className="profile-counts">
              <button type="button" className="link-btn" aria-pressed={list === "followers"} onClick={() => setList(list === "followers" ? null : "followers")}>{T.followers(n0(data.followers))}</button>
              <button type="button" className="link-btn" aria-pressed={list === "following"} onClick={() => setList(list === "following" ? null : "following")}>{T.followingN(n0(data.followingCount))}</button>
            </p>
          </div>
        </div>
        <div className="profile-actions">
          {data.me ? <Link href={p("/tai-khoan")} className="btn">{T.edit}</Link>
            : user === null ? <Link href={`${p("/dang-nhap")}?next=${encodeURIComponent(profilePath(u.handle))}`} className="btn primary">{T.loginToFollow}</Link>
            : <button type="button" className={`btn ${data.following ? "" : "primary"}`} disabled={busy || user === undefined} onClick={toggleFollow}
                aria-pressed={data.following} title={data.following ? T.unfollow : undefined}>{data.following ? T.following : T.follow}</button>}
          {error && <span className="stamp" role="alert" style={{ color: "var(--negative)" }}>{error}</span>}
        </div>
      </div>

      {list && <FollowList handle={u.handle} which={list} />}

      <div className="grid split">
        <div className="col col-l">
          {data.machines.length === 0 ? <section className="panel"><p className="empty">{T.noMachine}</p></section>
            : data.machines.map((m) => (
              <MachineCard key={m.id} m={m} rank={m.isPrimary ? data.rank : null} canLike={!data.me} loggedIn={!!user}
                handle={u.handle} onLike={(patch) => setMachine(m.id, patch)} />
            ))}
        </div>
        <div className="col col-r">
          <section className="panel" aria-labelledby="h-selling">
            <header><h2 id="h-selling">{T.listings}</h2><span className="meta num">{data.listings.length || ""}</span></header>
            {data.listings.length === 0 ? <p className="muted">{T.noListings}</p> : (
              <ul className="profile-listings">
                {data.listings.map((l) => (
                  <li key={l.id}>
                    <Link href={p(listingPath(l))} className="profile-listing">
                      <span className="thumb" aria-hidden="true">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {l.photos[0] ? <img src={photoUrl(l.photos[0])} alt="" loading="lazy" /> : <span>{l.kind.toUpperCase()}</span>}
                      </span>
                      <span className="profile-listing-name">{localizePartLabel(l.name, locale)}</span>
                      <span className="num profile-listing-price">{vnd(l.priceVnd)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function MachineCard({ m, rank, canLike, loggedIn, handle, onLike }: {
  m: ProfileMachine; rank: PublicProfile["rank"]; canLike: boolean; loggedIn: boolean; handle: string; onLike: (patch: Partial<ProfileMachine>) => void;
}) {
  const { t, p, n0, locale } = useI18n();
  const T = t.profile, M = t.machine, K = t.listing.kind;
  const [busy, setBusy] = useState(false);
  const tier = TIERS.find((x) => x.code === m.tier);
  const ok = (kind: PartKind, i = 0) => m.parts.filter((x) => x.kind === kind)[i]?.verified ?? false;
  const verified = m.parts.filter((x) => x.kind !== "psu").length > 0 && m.parts.filter((x) => x.kind !== "psu").every((x) => x.verified);
  const s = m.spec;
  const laptop = isLaptop(s);
  const rows: { key: string; label: string; value: string; verified: boolean }[] = [
    ...(laptop ? [{ key: "model", label: t.cfg.laptopModel, value: s.laptopModel ?? t.cfg.laptop, verified: false }] : []),
    { key: "cpu", label: "CPU", value: s.cpu, verified: ok("cpu") },
    { key: "gpu", label: K.gpu!, value: s.gpu + (laptop && s.gpuTgpW ? ` · ${s.gpuTgpW} W` : ""), verified: ok("gpu") },
    ...(laptop ? [] : [{ key: "mb", label: K.mainboard!, value: localizePartLabel(partLabel.mainboard(s.mainboard), locale), verified: ok("mainboard") }]),
    ...s.ram.map((k, i) => ({ key: `ram${i}`, label: "RAM", value: partLabel.ram(k), verified: ok("ram", i) })),
    ...s.drives.map((d, i) => ({ key: `d${i}`, label: K.storage!, value: partLabel.drive(d), verified: ok("storage", i) })),
    ...(laptop ? [] : [{ key: "psu", label: K.psu!, value: localizePartLabel(partLabel.psu(s.psu), locale), verified: false }]),
  ];
  const b = m.bench;
  const benched = b && [b.cpu, b.gpu].filter((d) => d?.trust === "verified" && d.pct != null);

  const like = async () => {
    setBusy(true);
    try {
      const r = await api<{ liked: boolean; likes: number }>(`/v1/machines/${m.id}/like`, { method: m.liked ? "DELETE" : "POST", body: {} });
      onLike({ liked: r.liked, likes: r.likes });
    } catch { /* bỏ qua: nút vẫn ở trạng thái cũ */ }
    setBusy(false);
  };

  return (
    <section className="panel score-card profile-machine" style={m.tier ? tierVars(m.tier) : undefined} aria-label={m.name}>
      <header>
        <h2>{m.name} <span className="faint small">· {m.isPrimary ? T.primary : T.secondary}{laptop ? ` · ${t.cfg.laptop}` : ""}</span></h2>
        {canLike && (loggedIn
          ? <button type="button" className={`btn small like-btn${m.liked ? " on" : ""}`} aria-pressed={m.liked} disabled={busy} onClick={like}>
              <Heart size={14} aria-hidden="true" fill={m.liked ? "currentColor" : "none"} />{m.liked ? T.liked : T.like}<span className="num"> · {n0(m.likes)}</span>
            </button>
          : <Link href={`${p("/dang-nhap")}?next=${encodeURIComponent(profilePath(handle))}`} className="btn small like-btn" title={T.likeLogin}>
              <Heart size={14} aria-hidden="true" />{n0(m.likes)}
            </Link>)}
        {!canLike && m.likes > 0 && <span className="meta"><Heart size={13} aria-hidden="true" style={{ verticalAlign: -2 }} /> {T.likes(n0(m.likes))}</span>}
      </header>
      {m.power != null && tier && (
        <div className="score-head">
          <TierEmblem code={tier.code} label={tierName(tier, locale)} />
          <div>
            <div className="answer num tier-ink">{n0(m.power)}</div>
            <div className="tier-name">{M.tier(tierName(tier, locale))}{rank ? ` · ${T.rank(rank.rank, rank.of, rank.laptop)}` : ""}</div>
          </div>
        </div>
      )}
      <p className="profile-pills">
        <span className={`pill ${verified ? "pos" : ""}`} title={verified ? M.verifiedTip : M.unverifiedTip}>{verified ? M.verified : M.unverified}</span>
        {benched && benched.length > 0 && (
          <span className="pill pos" title={t.board.benchTip}>{t.board.benched} · {[b!.cpu?.trust === "verified" && b!.cpu.pct != null ? `CPU ${b!.cpu.pct}%` : null,
            b!.gpu?.trust === "verified" && b!.gpu.pct != null ? `${t.board.benchGpu} ${b!.gpu.pct}%` : null].filter(Boolean).join(" · ")}</span>
        )}
      </p>
      <dl className="detail-spec">
        {rows.map((r) => (
          <div key={r.key}><dt>{r.label}</dt><dd>{r.value}{r.verified && <span className="pill pos small-pill">{t.pcDetail.verifiedShort}</span>}</dd></div>
        ))}
      </dl>
    </section>
  );
}

function FollowList({ handle, which }: { handle: string; which: "followers" | "following" }) {
  const { t, p, n0, locale } = useI18n();
  const T = t.profile;
  const [items, setItems] = useState<FollowRow[] | null>(null);
  useEffect(() => {
    let live = true;
    api<{ items: FollowRow[] }>(`/v1/users/${encodeURIComponent(handle)}/${which}`).then((r) => { if (live) setItems(r.items); }).catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [handle, which]);
  return (
    <section className="panel" aria-labelledby="h-follow" style={{ marginBottom: "var(--gap)" }}>
      <header><h2 id="h-follow">{which === "followers" ? T.followersTitle : T.followingTitle}</h2></header>
      {items === null ? <div className="skeleton" style={{ height: 44 }} />
        : items.length === 0 ? <p className="muted">{which === "followers" ? T.noFollowers : T.noFollowing}</p>
        : (
          <ul className="follow-list">
            {items.map((f) => {
              const tier = TIERS.find((x) => x.code === f.tier);
              return (
                <li key={f.handle}>
                  <Link href={p(profilePath(f.handle))} className="follow-row">
                    <span className="avatar" aria-hidden="true" style={{ background: personTint(f.displayName) }}>{initialOf(f.displayName)}</span>
                    <span style={{ minWidth: 0 }}><b>{f.displayName}</b><span className="faint small"> @{f.handle}{f.province ? ` · ${f.province}` : ""}</span></span>
                    {f.power != null && tier && <span className="pill tier-pill num" style={tierVars(tier.code)}>{n0(f.power)} · {tierName(tier, locale)}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}
