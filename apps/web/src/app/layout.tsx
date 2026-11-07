import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Shell } from "@/components/shell";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "vietnamese"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: { default: "f2m · Mạng xã hội PC", template: "%s · f2m" },
  description: "Khai báo cấu hình PC, xem điểm sức mạnh và hạng, tìm điểm nghẽn, gợi ý nâng cấp, mua bán linh kiện cũ.",
};

export const viewport: Viewport = { themeColor: "#0c0d0f", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" data-theme="dark" className={inter.variable}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
