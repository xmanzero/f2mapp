"use client";

import { TIERS, tierName } from "@f2m/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { personTint } from "@/data/sample";
import { useI18n } from "@/i18n/client";
import { api, ApiError } from "@/lib/api";
import { listingPath } from "@/lib/listing-url";
import { profilePath } from "@/lib/profile";
import { useSession } from "@/lib/session";
import { ago } from "@/lib/time";
import { tierVars } from "./tier";

type Data = Record<string, unknown> & {
  cpu?: string | { part: string | null; pct: number } | null; gpu?: string | { part: string | null; pct: number } | null;
  laptop?: boolean; kind?: string; from?: string; to?: string; power?: number;
  listingId?: string; name?: string; priceVnd?: number; province?: string | null;
};
interface Item { id: string; kind: string; data: Data; createdAt: string; mine: boolean; user: { handle: string; displayName: string } }
interface Suggest { handle: string; displayName: string; province: string | null; power: number; tier: string; formFactor: string }
interface FeedRes { items: Item[]; following: number; suggestions: Suggest[] }

const initialOf = (n: string) => n.trim()[0]?.toUpperCase() ?? "?";

/** Bảng tin: hoạt động của người mình theo dõi (và của mình), gợi ý theo dõi khi theo dõi còn ít người */
export function Feed() {
  const { user } = useSession();
  const { t, p } = useI18n();
  const T = t.feed;
  const [data, setData] = useState<FeedRes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    api<FeedRes>("/v1/feed").then((r) => { setData(r); setMore(r.items.length >= 30); }).catch((e: ApiError) => setError(e.message));
  }, [user]);

  const head = <div className="title-row"><div><h1>{T.title}</h1><p className="sub">{user === null ? T.login : T.sub}</p></div></div>;
  if (user === undefined) return head;
  if (user === null) return <>{head}<p className="empty"><Link href={`${p("/dang-nhap")}?next=/bang-tin`} className="btn primary">{t.common.login}</Link></p></>;
  if (error) return <>{head}<p className="form-error">{error}</p></>;

  const loadMore = async () => {
    if (!data?.items.length) return;
    setBusy(true);
    try {
      const r = await api<FeedRes>(`/v1/feed?before=${encodeURIComponent(data.items.at(-1)!.createdAt)}`);
      setData({ ...data, items: [...data.items, ...r.items] });
      setMore(r.items.length >= 30);
    } catch { /* bỏ qua */ }
    setBusy(false);
  };
  const followed = (handle: string) => setData((d) => d && ({ ...d, following: d.following + 1, suggestions: d.suggestions.filter((s) => s.handle !== handle) }));

  return (
    <>
      {head}
      <div className="grid split">
        <div className="col col-l">
          <section className="panel" aria-label={T.title}>
            {data === null ? [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 56, marginTop: i ? 10 : 0 }} />)
              : data.items.length === 0 ? <p className="empty">{T.empty}</p>
              : (
                <ul className="feed">
                  {data.items.map((it) => <FeedRow key={it.id} it={it} />)}
                </ul>
              )}
            {data && data.items.length > 0 && more && (
              <button type="button" className="btn small" style={{ marginTop: 12 }} disabled={busy} onClick={loadMore}>{T.more}</button>
            )}
          </section>
        </div>
        {data && data.suggestions.length > 0 && (
          <div className="col col-r">
            <section className="panel" aria-labelledby="h-suggest">
              <header><h2 id="h-suggest">{T.suggest}</h2><span className="meta">{T.suggestSub}</span></header>
              <ul className="follow-list">
                {data.suggestions.map((s) => <SuggestRow key={s.handle} s={s} onFollowed={() => followed(s.handle)} />)}
              </ul>
            </section>
          </div>
        )}
      </div>
    </>
  );
}

function FeedRow({ it }: { it: Item }) {
  const { t, p, n0, vnd, locale } = useI18n();
  const T = t.feed;
  const d = it.data;
  const tierOf = (code?: string) => TIERS.find((x) => x.code === code);
  let text: React.ReactNode = null;
  let href: string | null = null;
  if (it.kind === "machine_added") text = T.machineAdded(String(d.cpu ?? ""), String(d.gpu ?? ""), !!d.laptop);
  else if (it.kind === "part_changed") text = T.partChanged(d.kind === "cpu" ? T.kindCpu : T.kindGpu, d.from ?? "", d.to ?? "");
  else if (it.kind === "tier_up") { const tr = tierOf(d.to); text = T.tierUp(tr ? tierName(tr, locale) : d.to ?? "", n0(d.power ?? 0)); }
  else if (it.kind === "listing_posted" && d.listingId) {
    text = T.listingPosted(d.name ?? "", vnd(d.priceVnd ?? 0));
    href = p(listingPath({ id: d.listingId, name: d.name ?? "", province: d.province }));
  } else if (it.kind === "bench_verified") {
    const part = (x: Data["cpu"], label: string) => (x && typeof x === "object" ? `${label} ${x.pct}%` : null);
    text = T.benchVerified([part(d.cpu, "CPU"), part(d.gpu, t.bench.gpu)].filter(Boolean).join(" · "));
  }
  if (!text) return null;
  const who = it.mine ? T.you : it.user.displayName;
  const tier = it.kind === "tier_up" ? tierOf(d.to) : undefined;
  return (
    <li className="feed-row">
      <Link href={p(profilePath(it.user.handle))} className="avatar" aria-hidden="true" tabIndex={-1}
        style={{ background: it.mine ? "var(--accent)" : personTint(it.user.displayName) }}>{initialOf(it.user.displayName)}</Link>
      <div className="feed-body">
        <p>
          <Link href={p(profilePath(it.user.handle))} className="feed-who">{who}</Link>{" "}
          {href ? <Link href={href} className="feed-link">{text}</Link> : text}
          {tier && <span className="pill tier-pill" style={{ ...tierVars(tier.code), marginLeft: 8 }}>{tierName(tier, locale)}</span>}
        </p>
        <small className="faint">{ago(it.createdAt, locale)}</small>
      </div>
    </li>
  );
}

function SuggestRow({ s, onFollowed }: { s: Suggest; onFollowed: () => void }) {
  const { t, p, n0, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const tier = TIERS.find((x) => x.code === s.tier);
  const follow = async () => {
    setBusy(true);
    try { await api(`/v1/users/${encodeURIComponent(s.handle)}/follow`, { method: "POST", body: {} }); onFollowed(); } catch { setBusy(false); }
  };
  return (
    <li className="follow-row">
      <span className="avatar" aria-hidden="true" style={{ background: personTint(s.displayName) }}>{initialOf(s.displayName)}</span>
      <Link href={p(profilePath(s.handle))} style={{ minWidth: 0, color: "inherit", textDecoration: "none" }}>
        <b>{s.displayName}</b>
        <span className="faint small"> {n0(s.power)}{tier ? ` · ${tierName(tier, locale)}` : ""}{s.formFactor === "laptop" ? ` · ${t.cfg.laptop}` : ""}</span>
      </Link>
      <button type="button" className="btn small" style={{ marginLeft: "auto" }} disabled={busy} onClick={follow}>{t.profile.follow}</button>
    </li>
  );
}
