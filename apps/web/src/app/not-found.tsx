import Link from "next/link";
import { Mascot } from "@/components/mascot";

export default function NotFound() {
  return (
    <section className="panel empty-state" aria-labelledby="h-404">
      <Mascot size={140} />
      <div>
        <h1 id="h-404">Không tìm thấy trang này</h1>
        <p className="muted">Địa chỉ có thể đã đổi, tin rao có thể đã bị xóa hoặc hết hạn.</p>
        <div className="empty-actions">
          <Link href="/may" className="btn primary">Máy của tôi</Link>
          <Link href="/cho" className="btn">Chợ linh kiện</Link>
        </div>
      </div>
    </section>
  );
}
