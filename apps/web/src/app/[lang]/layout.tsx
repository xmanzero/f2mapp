import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Inter } from "next/font/google";
import { Shell } from "@/components/shell";
import { brandFor, getBranding } from "@/lib/branding";
import { I18nProvider } from "@/i18n/client";
import { LOCALES } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import "../globals.css";

// Inter bản biến thiên (đủ độ đậm, cả 800 cho chữ logo PCDEX)
const inter = Inter({ variable: "--font-inter", subsets: ["latin", "vietnamese"] });
// Font tiêu đề và con số lớn: chất "phần cứng" (ui-ux-pro-max gợi ý cho gaming; có đủ dấu tiếng Việt)
const chakra = Chakra_Petch({ variable: "--font-chakra", subsets: ["latin", "vietnamese"], weight: ["600", "700"] });

/** Dựng sẵn trang cho mọi ngôn ngữ */
export async function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

/** Tên, slogan, mô tả, favicon lấy từ phần Thương hiệu trong trang quản trị (mặc định: PCDEX Brand Kit), theo ngôn ngữ trang */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const b = brandFor(await getBranding(), locale);
  const fav = b.favicon?.url;
  const sized = (n: number) => fav!.replace("?", `?s=${n}&`);
  return {
    metadataBase: new URL(process.env.WEB_URL ?? "https://pcdex.app"),
    title: { default: b.slogan ? `${b.siteName} · ${b.slogan}` : b.siteName, template: `%s · ${b.siteName}` },
    description: b.description,
    applicationName: b.siteName,
    icons: fav
      ? { icon: [{ url: sized(32), sizes: "32x32", type: "image/png" }, { url: sized(192), sizes: "192x192", type: "image/png" }], apple: [{ url: sized(180), sizes: "180x180" }] }
      : { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/favicon.ico", sizes: "48x48" }], apple: [{ url: "/apple-icon.png", sizes: "180x180" }] },
  };
}

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#080f24" }, { media: "(prefers-color-scheme: light)", color: "#eef2fa" }],
};

// Đặt chế độ Ngày/Đêm đã chọn trước khi trang hiện ra (không nháy màu). Chưa chọn thì theo hệ điều hành (CSS media).
// ?theme=dark|light trên địa chỉ: xem thử một lần, không lưu (dùng khi chia sẻ link hoặc kiểm tra giao diện).
const THEME_SCRIPT = `(function(){try{var q=new URLSearchParams(location.search).get("theme");var t=q||localStorage.getItem("f2m.theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale();
  const brand = brandFor(await getBranding(), locale);
  return (
    <html lang={locale} className={`${inter.variable} ${chakra.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <I18nProvider locale={locale}>
          <Shell brand={brand}>{children}</Shell>
        </I18nProvider>
      </body>
    </html>
  );
}
