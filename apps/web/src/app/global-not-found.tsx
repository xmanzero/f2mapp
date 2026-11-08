import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

/**
 * Trang 404 cho địa chỉ không khớp trang nào (layout gốc nằm trong [lang] nên không biết ngôn ngữ):
 * hiện cả tiếng Việt lẫn tiếng Anh. Lỗi 404 bên trong một trang (tin rao đã xóa…) dùng [lang]/not-found.tsx.
 */
const inter = Inter({ variable: "--font-inter", subsets: ["latin", "vietnamese"] });

export const metadata: Metadata = { title: "404 · pcdex", robots: { index: false, follow: false } };

export default function GlobalNotFound() {
  return (
    <html lang="vi" className={inter.variable}>
      <body>
        <main className="canvas" style={{ maxWidth: 760, margin: "0 auto", paddingTop: 64 }}>
          <section className="panel empty-state" aria-labelledby="h-404">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mascot.svg" alt="" width={140} height={152} className="mascot" />
            <div>
              <h1 id="h-404">Không tìm thấy trang này</h1>
              <p className="muted" lang="en">Page not found</p>
              <p className="muted" style={{ marginTop: 8 }}>Địa chỉ có thể đã đổi. <span lang="en">The address may have changed.</span></p>
              <div className="empty-actions">
                <Link href="/" className="btn primary">Trang chủ</Link>
                <Link href="/en" className="btn" lang="en">Home (English)</Link>
              </div>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
