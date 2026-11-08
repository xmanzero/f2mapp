"use client";

import { listingPath } from "@/lib/listing-url";
import { localizePartLabel } from "@f2m/shared";
import { useI18n } from "@/i18n/client";
import { machineName } from "@/lib/use-machine";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { daysSince, type Listing, type ListingStatus, type SellablePart } from "@/lib/listings";
import { useSession } from "@/lib/session";
import { useNow } from "@/lib/use-now";

const STATUS_CLASS: Record<ListingStatus, string> = { active: "pos", reserved: "warn", sold: "", hidden: "", expired: "neg" };

export function MyListings() {
  const { user } = useSession();
  const { t, p: lp, vnd, locale } = useI18n();
  const T = t.myListings, L = t.listing;
  const label = (s: string) => localizePartLabel(s, locale);
  const [data, setData] = useState<{ items: Listing[]; parts: SellablePart[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const now = useNow();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  function load() {
    api<{ items: Listing[]; parts: SellablePart[] }>("/v1/me/listings").then(setData).catch(() => setFailed(true));
  }
  async function removePart(p: SellablePart) {
    setMsg(null);
    try { await api(`/v1/me/parts/${p.id}`, { method: "DELETE" }); setMsg(T.removedFromStock(label(p.label))); load(); }
    catch (e) { setMsg((e as Error).message); }
  }

  if (user === undefined) return <div className="title-row"><div><h1>{t.pages.myListings}</h1><p className="sub">{t.common.loading}</p></div></div>;
  if (user === null)
    return (
      <>
        <div className="title-row"><div><h1>{t.pages.myListings}</h1><p className="sub">{T.needLogin}</p></div></div>
        <p className="empty"><Link href={`${lp("/dang-nhap")}?next=/cho/cua-toi`} className="card-link">{t.common.login}</Link>{T.toManage}</p>
      </>
    );

  const items = data?.items ?? [];
  const active = items.filter((l) => l.status === "active" || l.status === "reserved").length;
  return (
    <>
      <div className="title-row">
        <div>
          <p className="crumb"><Link href={lp("/cho")} className="card-link">{t.nav.market}</Link></p>
          <h1>{t.pages.myListings}</h1>
          <p className="sub">{data ? T.summary(active, items.filter((l) => l.status === "sold").length) : failed ? T.loadFailed : t.common.loading}</p>
        </div>
        <Link href={lp("/cho/dang-tin")} className="btn primary">{t.pages.postListing}</Link>
      </div>

      <div className="grid">
        <section className="panel s7" aria-labelledby="h-mine">
          <header><h2 id="h-mine">{T.posted}</h2><span className="meta">{T.maxActive}</span></header>
          {!data ? (
            <div aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 52, marginTop: 8 }} />)}</div>
          ) : items.length === 0 ? (
            <p className="empty">{T.none} <Link href={lp("/cho/dang-tin")} className="card-link">{T.first}</Link></p>
          ) : (
            <ul className="rows">
              {items.map((l) => (
                <li key={l.id} className="row">
                  <div className="grow">
                    <Link href={lp(listingPath(l))} className="card-link">{label(l.name)}</Link>
                    <div className="line2">
                      {T.postedAgo(L.daysAgo(daysSince(l.createdAt)))}
                      {l.soldAt ? T.soldAgo(L.daysAgo(daysSince(l.soldAt))) : ""}
                      {now && (l.status === "active" || l.status === "reserved") ? ` · ${L.remaining(new Date(l.expiresAt).getTime() - now)}` : ""}
                      {l.status === "expired" ? T.reopen : ""}
                    </div>
                  </div>
                  {l.removedReason
                    ? <span className="pill neg" title={T.removedTip(l.removedReason)}>{T.removedPill(l.removedReason)}</span>
                    : <span className={`pill ${STATUS_CLASS[l.status]}`}>{L.status[l.status]}</span>}
                  <span className="num" style={{ fontWeight: 600, minWidth: 110, textAlign: "right" }}>{vnd(l.priceVnd)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel s5" aria-labelledby="h-replaced">
          <header><h2 id="h-replaced">{T.stock}</h2></header>
          {!data ? (
            <div className="skeleton" style={{ height: 52 }} aria-busy="true" />
          ) : (() => {
            const stored = data.parts.filter((p) => !p.inUse && !p.listingId);
            return stored.length === 0 ? (
              <p className="empty">{T.stockEmpty(<Link href={lp("/may")} className="card-link">{t.nav.machine}</Link>)}</p>
            ) : (
              <ul className="rows">
                {stored.map((p) => (
                  <li key={p.id} className="row">
                    <div className="grow"><div style={{ fontWeight: 500 }}>{label(p.label)}</div><div className="line2">{L.kind[p.kind]} · {T.fromPc(machineName(p.machineName, locale))}</div></div>
                    <Link href={`${lp("/cho/dang-tin")}?mp=${p.id}`} className="btn small">{t.machine.sell}</Link>
                    <button className="btn small" onClick={() => void removePart(p)} aria-label={T.removeAria(label(p.label))}>{t.common.delete}</button>
                  </li>
                ))}
              </ul>
            );
          })()}
          {msg && <p className="stamp" role="status" style={{ marginTop: 10 }}>{msg}</p>}
        </section>
      </div>
    </>
  );
}
