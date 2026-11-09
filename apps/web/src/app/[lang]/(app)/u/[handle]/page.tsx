import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TIERS, tierName } from "@f2m/shared";
import { Profile } from "@/components/profile";
import { LOCALES, localePath } from "@/i18n/config";
import { socialMeta } from "@/i18n/meta";
import { getI18n } from "@/i18n/server";
import { profilePath, type PublicProfile } from "@/lib/profile";
import { publicProfile } from "@/lib/server-data";
import { SITE_URL } from "@/lib/site";

/**
 * Hồ sơ công khai /u/<tên> (và /en/u/…): máy chủ dựng sẵn HTML (tên, máy, điểm, tin đang bán) + schema.org ProfilePage.
 * Người chưa có máy nào thì vẫn mở được nhưng không đưa vào kết quả tìm kiếm.
 */
async function load(params: PageProps<"/[lang]/u/[handle]">["params"]) {
  const { handle } = await params;
  return publicProfile(decodeURIComponent(handle));
}

function summary(p: PublicProfile, locale: "vi" | "en", n0: (x: number) => string) {
  const m = p.machines.find((x) => x.isPrimary) ?? p.machines[0];
  const tier = m?.tier ? TIERS.find((x) => x.code === m.tier) : undefined;
  return { m, power: m?.power != null ? n0(m.power) : null, tier: tier ? tierName(tier, locale) : null, build: m ? `${m.spec.cpu} + ${m.spec.gpu}` : null };
}

export async function generateMetadata({ params }: PageProps<"/[lang]/u/[handle]">): Promise<Metadata> {
  const { t, locale, n0 } = await getI18n();
  const p = await load(params);
  if (!p) return { title: t.profile.notFound, robots: { index: false, follow: true } };
  const s = summary(p, locale, n0);
  const title = `${p.user.displayName} (@${p.user.handle})`;
  const description = t.seo.profile(p.user.displayName, s.power, s.tier, s.build);
  const path = profilePath(p.user.handle);
  return {
    title, description, ...socialMeta(locale, localePath(locale, path), `${title} · pcdex`, description),
    alternates: { canonical: localePath(locale, path), languages: Object.fromEntries(LOCALES.map((x) => [x, localePath(x, path)])) },
    robots: p.machines.length ? undefined : { index: false, follow: true },
  };
}

async function Body({ params }: { params: PageProps<"/[lang]/u/[handle]">["params"] }) {
  const { locale, n0 } = await getI18n();
  const p = await load(params);
  if (!p) notFound();
  const s = summary(p, locale, n0);
  const ld = {
    "@context": "https://schema.org", "@type": "ProfilePage",
    dateCreated: p.user.joinedAt,
    mainEntity: {
      "@type": "Person", name: p.user.displayName, alternateName: `@${p.user.handle}`,
      url: `${SITE_URL}${localePath(locale, profilePath(p.user.handle))}`,
      interactionStatistic: [
        { "@type": "InteractionCounter", interactionType: "https://schema.org/FollowAction", userInteractionCount: p.followers },
        ...(s.m ? [{ "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: s.m.likes }] : []),
      ],
      ...(p.user.province ? { homeLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressRegion: p.user.province, addressCountry: "VN" } } } : {}),
    },
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <Profile initial={p} />
    </>
  );
}

export default async function Page({ params }: PageProps<"/[lang]/u/[handle]">) {
  const { t } = await getI18n();
  return (
    <Suspense fallback={<div className="title-row"><div><h1>@…</h1><p className="sub">{t.common.loading}</p></div></div>}>
      <Body params={params} />
    </Suspense>
  );
}
