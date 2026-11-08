import type { Metadata } from "next";
import Link from "next/link";
import { LiveScore, PanelNotes, Platforms, Reveal, Showcase, Stages, TopLink, type Note, type Panel, type Platform, type Stage } from "@/components/landing";
import { Mascot } from "@/components/mascot";
import { BrandLogo } from "@/components/brand-logo";
import { brandFor, getBranding } from "@/lib/branding";
import { LOCALES, localePath } from "@/i18n/config";
import { getI18n } from "@/i18n/server";
import "../landing.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t, locale } = await getI18n();
  const b = await getBranding();
  return {
    title: { absolute: `${b.siteName} · ${t.landing.title}` },
    description: t.landing.description,
    alternates: { canonical: localePath(locale, "/"), languages: { ...Object.fromEntries(LOCALES.map((l) => [l, localePath(l, "/")])), "x-default": "/" } },
  };
}

/** Ảnh chụp giao diện thật theo ngôn ngữ (chụp lại khi giao diện đổi) */
const shots = (locale: string) => (locale === "vi" ? "/landing" : `/landing/${locale}`);
/** Kích thước ảnh và vị trí chú thích không đổi theo ngôn ngữ */
const PANEL_IMG = [
  { file: "score", w: 673, h: 420 }, { file: "osd", w: 673, h: 362 }, { file: "board", w: 1164, h: 560 },
  { file: "market", w: 1164, h: 620 }, { file: "scanner", w: 471, h: 331 },
];
const NOTE_POS: Pick<Note, "side" | "top" | "height">[] = [
  { side: "r", top: 2, height: 9 }, { side: "l", top: 11.7, height: 19.4 }, { side: "l", top: 32.1, height: 13.6 },
  { side: "r", top: 46.7, height: 17.9 }, { side: "r", top: 70.8, height: 13.6 }, { side: "l", top: 90.7, height: 9.3 },
];
const STAGE_IMG = [
  { file: "score", w: 673, h: 420 }, { file: "scanner", w: 471, h: 331 }, { file: "scanned", w: 673, h: 354 }, { file: "podium", w: 1164, h: 215 },
];
const PLATFORM_META = [
  { id: "web", name: "Web", status: "pcdex.app", live: true },
  { id: "windows", name: "Windows", status: "pcdex-scan", live: true },
  { id: "android", name: "Android", status: null, live: false },
  { id: "ios", name: "iOS", status: null, live: false },
];

export default async function Landing() {
  const { t, p, locale } = await getI18n();
  const T = t.landing;
  const brand = brandFor(await getBranding(), locale);
  const L = shots(locale);
  const panels: Panel[] = PANEL_IMG.map((im, i) => ({ src: `${L}/${im.file}.webp`, w: im.w, h: im.h, ...T.panels[i]! }));
  const notes: Note[] = NOTE_POS.map((pos, i) => ({ ...pos, ...T.notes[i]! }));
  const stages: Stage[] = STAGE_IMG.map((im, i) => ({ src: `${L}/${im.file}.webp`, w: im.w, h: im.h, ...T.stages[i]! }) as Stage);
  const platforms: Platform[] = PLATFORM_META.map((m) => ({ ...m, status: m.status ?? T.soon, rows: T.platformRows[m.id]! }));

  return (
    <div className="lp">
      <Reveal />
      {/* ---------- màn đầu ---------- */}
      <header className="lp-hero">
        <div className="lp-hero-l">
          <Link href={p("/")} className="lp-brand" aria-label={brand.siteName}><BrandLogo brand={brand} height={34} /></Link>
          <div className="lp-hero-copy">
            <h1 className="lp-h1"><span className="lp-mask"><span>{T.title}</span></span></h1>
            <p className="lp-lede">{T.lede}</p>
            <div className="lp-actions">
              <Link href={p("/may")} className="lp-btn">{T.scoreMine}</Link>
              <a href="/tai/pcdex-scan.exe" download className="lp-link">{T.downloadScan}</a>
            </div>
          </div>
        </div>
        <div className="lp-hero-r">
          <TopLink />
          <LiveScore />
        </div>
      </header>

      {/* ---------- các màn hình ---------- */}
      <section className="lp-sec lp-showcase" aria-labelledby="lp-h-show">
        <h2 id="lp-h-show" className="lp-h2" data-reveal>{T.inside}</h2>
        <div data-reveal data-d="1"><Showcase panels={panels} /></div>
      </section>

      {/* ---------- cấu hình chi tiết ---------- */}
      <section className="lp-sec" aria-labelledby="lp-h-parts">
        <h2 id="lp-h-parts" className="lp-h2 lp-center" data-reveal>{T.parts}</h2>
        <div data-reveal data-d="1">
          <PanelNotes src={`${L}/config.webp`} w={477} h={919} notes={notes} alt={T.partsAlt} />
        </div>
      </section>

      {/* ---------- các bước ---------- */}
      <section className="lp-sec lp-steps" aria-label={T.stepsAria}>
        <Stages stages={stages} />
      </section>

      {/* ---------- nền tảng ---------- */}
      <section className="lp-sec" aria-label={T.platforms}>
        <Platforms items={platforms} action={<Link href={p("/may")} className="lp-btn">{T.openWeb}</Link>} />
      </section>

      {/* ---------- lời mời ---------- */}
      <section className="lp-cta" aria-labelledby="lp-h-cta">
        <div className="lp-tile lp-tile-photo" data-reveal>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/pc-build.webp" width={1200} height={900} alt={T.photo1Alt} loading="lazy" />
        </div>
        <div className="lp-tile lp-tile-main" data-reveal data-d="1">
          <Mascot size={112} className="lp-mascot" />
          <h2 id="lp-h-cta">{T.ctaTitle}</h2>
          <p>{T.ctaText}</p>
          <Link href={p("/may")} className="lp-btn dark">{T.start}</Link>
        </div>
        <div className="lp-tile lp-tile-photo" data-reveal data-d="2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/board-macro.webp" width={1024} height={683} alt={T.photo2Alt} loading="lazy" />
        </div>
      </section>

      <footer className="lp-foot">
        <span className="soft">{brand.siteName}{brand.slogan ? ` · ${brand.slogan}` : ""}</span>
        <nav aria-label={T.links}>
          <Link href={p("/may")}>{t.nav.machine}</Link>
          <Link href={p("/xep-hang")}>{T.ranks}</Link>
          <Link href={p("/cho")}>{T.market}</Link>
          <a href="/tai/pcdex-scan.exe" download>pcdex-scan</a>
        </nav>
        <span className="soft">2026 · <Link href={p("/chinh-sach-quyen-rieng-tu")}>{t.nav.privacy}</Link> · <Link href={p("/dieu-khoan")}>{t.nav.terms}</Link></span>
        <p className="lp-credits">{T.credits}</p>
      </footer>
    </div>
  );
}
