import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Inter } from "next/font/google";
import { Shell } from "@/components/shell";
import "./globals.css";

// Inter bản biến thiên (đủ độ đậm, cả 800 cho chữ logo PCDEX)
const inter = Inter({ variable: "--font-inter", subsets: ["latin", "vietnamese"] });
// Font tiêu đề và con số lớn: chất "phần cứng" (ui-ux-pro-max gợi ý cho gaming; có đủ dấu tiếng Việt)
const chakra = Chakra_Petch({ variable: "--font-chakra", subsets: ["latin", "vietnamese"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: { default: "pcdex · Mạng xã hội PC", template: "%s · pcdex" },
  description: "Khai báo cấu hình PC, xem điểm sức mạnh và hạng, tìm điểm nghẽn, gợi ý nâng cấp, mua bán linh kiện cũ.",
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#080f24" }, { media: "(prefers-color-scheme: light)", color: "#eef2fa" }],
};

// Đặt chế độ Ngày/Đêm đã chọn trước khi trang hiện ra (không nháy màu). Chưa chọn thì theo hệ điều hành (CSS media).
// ?theme=dark|light trên địa chỉ: xem thử một lần, không lưu (dùng khi chia sẻ link hoặc kiểm tra giao diện).
const THEME_SCRIPT = `(function(){try{var q=new URLSearchParams(location.search).get("theme");var t=q||localStorage.getItem("f2m.theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${inter.variable} ${chakra.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
