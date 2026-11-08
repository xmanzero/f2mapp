import Link from "next/link";
import { Mascot } from "@/components/mascot";
import { getI18n } from "@/i18n/server";

export default async function NotFound() {
  const { t, p } = await getI18n();
  return (
    <section className="panel empty-state" aria-labelledby="h-404">
      <Mascot size={140} />
      <div>
        <h1 id="h-404">{t.notFound.title}</h1>
        <p className="muted">{t.notFound.text}</p>
        <div className="empty-actions">
          <Link href={p("/may")} className="btn primary">{t.nav.machine}</Link>
          <Link href={p("/cho")} className="btn">{t.nav.market}</Link>
        </div>
      </div>
    </section>
  );
}
