import { Shell } from "@/components/shell";
import { brandFor, getBranding } from "@/lib/branding";
import { getLocale } from "@/i18n/server";

/** Khung app (thanh bên, thanh trên, thanh dưới trên điện thoại) cho mọi trang trừ trang chủ */
export default async function AppLayout({ children }: LayoutProps<"/[lang]">) {
  const brand = brandFor(await getBranding(), await getLocale());
  return <Shell brand={brand}>{children}</Shell>;
}
