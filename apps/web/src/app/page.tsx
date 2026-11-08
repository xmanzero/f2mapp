import type { Metadata } from "next";
import Link from "next/link";
import { LiveScore, PanelNotes, Platforms, Reveal, Showcase, Stages, TopLink, type Note, type Panel, type Platform, type Stage } from "@/components/landing";
import { Mark } from "@/components/mark";
import "./landing.css";

export const metadata: Metadata = {
  title: { absolute: "pcdex · Máy bạn mạnh cỡ nào?" },
  description: "Chấm điểm sức mạnh PC từ cấu hình thật: FPS theo màn hình, điểm nghẽn, gợi ý nâng cấp, bảng xếp hạng và chợ linh kiện cũ. Miễn phí, độc lập.",
};

const L = "/landing";

const PANELS: Panel[] = [
  { src: `${L}/score.webp`, w: 673, h: 420, name: "Điểm sức mạnh", alt: "Thẻ điểm sức mạnh 10.000, hạng Vàng, kèm sơ đồ máy và điểm Gaming, Đồ họa, AI",
    text: "Một con số cho cả máy: Gaming 50%, Đồ họa 30%, AI 20%. Hạng từ Đồng tới Huyền thoại, mốc 10.000 là i5-12400F với RTX 3060." },
  { src: `${L}/osd.webp`, w: 673, h: 362, name: "Khung hình theo màn hình", alt: "Thước FPS ở 1080p, 1440p và 4K với vạch mức CPU nuôi được",
    text: "FPS ước tính ở 1080p, 1440p và 4K. Vạch trắng là mức CPU nuôi được, nên máy nghẽn ở đâu nhìn là thấy." },
  { src: `${L}/board.webp`, w: 1164, h: 560, name: "Bảng xếp hạng", alt: "Bảng xếp hạng với bục top 3 và danh sách máy theo điểm",
    text: "Máy của bạn đứng thứ mấy trong cộng đồng. Máy đã quét bằng pcdex-scan có nhãn xác thực." },
  { src: `${L}/market.webp`, w: 1164, h: 620, name: "Chợ linh kiện", alt: "Danh sách tin rao linh kiện cũ kèm giá, điểm trên triệu và mức tăng điểm khi lắp vào máy",
    text: "Mỗi tin rao cho biết lắp vào máy bạn tăng bao nhiêu điểm và được bao nhiêu điểm trên mỗi triệu đồng." },
  { src: `${L}/scanner.webp`, w: 481, h: 356, name: "pcdex-scan cho Windows", alt: "Cửa sổ phần mềm pcdex-scan liệt kê CPU, card, mainboard, RAM, ổ cứng và màn hình của máy",
    text: "Phần mềm 48 KB, không cần cài, đọc cấu hình thật trong vài giây rồi gắn vào tài khoản bằng mã QR." },
];

const NOTES: Note[] = [
  { side: "r", name: "Tự đọc bằng pcdex-scan", text: "Không muốn gõ? Chạy phần mềm quét, cấu hình tự điền và có nhãn xác thực.", top: 2, height: 9 },
  { side: "l", name: "Chọn từ danh mục", text: "CPU và card chọn theo tên, điểm đổi ngay khi bạn đổi linh kiện.", top: 11.7, height: 19.4 },
  { side: "l", name: "Đúng thế hệ PCIe", text: "Chipset mainboard quyết định khe card; card x8 trên PCIe 3.0 sẽ bị trừ điểm.", top: 32.1, height: 13.6 },
  { side: "r", name: "RAM từng bộ", text: "Số thanh, dung lượng, thế hệ, tốc độ. Lắp sai thế hệ hay chạy kênh đơn đều được cảnh báo.", top: 46.7, height: 17.9 },
  { side: "r", name: "Ổ cứng và sức khỏe", text: "NVMe Gen3 tới Gen5, SATA, HDD; ổ còn dưới 80% sức khỏe sẽ được nhắc sao lưu.", top: 70.8, height: 13.6 },
  { side: "l", name: "Nguồn đủ chưa", text: "pcdex tính công suất cần theo CPU và card, báo khi nguồn yếu.", top: 90.7, height: 9.3 },
];

const STAGES: Stage[] = [
  { name: "Khai báo", clause: ["Đầu tiên,", "khai cấu hình"], src: `${L}/score.webp`, w: 673, h: 420, alt: "Thẻ điểm sức mạnh sau khi khai cấu hình" },
  { name: "Quét", clause: ["Sau đó,", "quét để xác thực"], src: `${L}/scanner.webp`, w: 481, h: 356, alt: "Phần mềm pcdex-scan đọc cấu hình máy" },
  { name: "Gắn tài khoản", clause: ["Rồi quét mã QR", "gắn vào tài khoản"], src: `${L}/scanned.webp`, w: 673, h: 354, alt: "Trang gắn kết quả quét: cấu hình máy vừa quét" },
  { name: "Xếp hạng & bán", clause: ["Cuối cùng,", "lên hạng và bán đồ cũ"], src: `${L}/podium.webp`, w: 1164, h: 215, alt: "Bục top 3 của bảng xếp hạng" },
];

const PLATFORMS: Platform[] = [
  { id: "web", name: "Web", status: "pcdex.app", live: true, rows: [
    ["Máy", "Khai cấu hình, điểm, FPS, gợi ý nâng cấp", "Tối đa 2 máy mỗi tài khoản, xem thử nâng cấp trước khi mua"],
    ["Hạng", "Bảng xếp hạng cộng đồng", "Xem chi tiết cấu hình từng máy trên bảng"],
    ["Chợ", "Rao bán linh kiện cũ kèm ảnh", "Lọc theo tỉnh, tin có thời hạn, chỉ bán linh kiện mình sở hữu"],
    ["Tài khoản", "Đăng nhập email hoặc Google", "Tự xóa tài khoản và dữ liệu bất cứ lúc nào"],
  ] },
  { id: "windows", name: "Windows", status: "pcdex-scan", live: true, rows: [
    ["Quét", "Đọc CPU, card, mainboard, RAM, ổ cứng, màn hình", "VRAM thật, thế hệ PCIe của card và ổ NVMe"],
    ["Gắn", "Gắn vào tài khoản bằng mã QR", "Cập nhật máy đang có hoặc tạo máy mới"],
    ["Nhẹ", "Một file 48 KB, không cần cài", "Windows 10 và 11, không cần quyền quản trị"],
  ] },
  { id: "android", name: "Android", status: "Sắp có", live: false, rows: [
    ["Máy", "Cùng tài khoản, cùng máy và điểm", "Dữ liệu đồng bộ với web"],
    ["Quét", "Quét mã QR của pcdex-scan ngay trong app", "Gắn máy vừa quét chỉ với một chạm"],
    ["Chợ", "Đăng tin bằng ảnh chụp từ điện thoại", "Ảnh được thu nhỏ và bỏ vị trí GPS trước khi gửi"],
  ] },
  { id: "ios", name: "iOS", status: "Sắp có", live: false, rows: [
    ["Máy", "Cùng tài khoản, cùng máy và điểm", "Dữ liệu đồng bộ với web"],
    ["Quét", "Quét mã QR của pcdex-scan ngay trong app", "Gắn máy vừa quét chỉ với một chạm"],
    ["Chợ", "Đăng tin bằng ảnh chụp từ iPhone", "Ảnh được thu nhỏ và bỏ vị trí GPS trước khi gửi"],
  ] },
];

export default function Landing() {
  return (
    <div className="lp">
      <Reveal />
      {/* ---------- màn đầu ---------- */}
      <header className="lp-hero">
        <div className="lp-hero-l">
          <Link href="/" className="lp-brand" aria-label="pcdex"><Mark size={26} /> pcdex</Link>
          <div className="lp-hero-copy">
            <h1 className="lp-h1"><span className="lp-mask"><span>Máy bạn mạnh cỡ nào?</span></span></h1>
            <p className="lp-lede">pcdex chấm điểm PC từ cấu hình thật: sức mạnh, FPS theo màn hình, chỗ nghẽn và nên nâng gì trước. Miễn phí, không gắn với cửa hàng nào.</p>
            <div className="lp-actions">
              <Link href="/may" className="lp-btn">Chấm điểm máy tôi</Link>
              <a href="/tai/pcdex-scan.exe" download className="lp-link">Tải pcdex-scan cho Windows</a>
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
        <h2 id="lp-h-show" className="lp-h2" data-reveal>Bên trong pcdex</h2>
        <div data-reveal data-d="1"><Showcase panels={PANELS} /></div>
      </section>

      {/* ---------- cấu hình chi tiết ---------- */}
      <section className="lp-sec" aria-labelledby="lp-h-parts">
        <h2 id="lp-h-parts" className="lp-h2 lp-center" data-reveal>Khai đúng từng linh kiện</h2>
        <div data-reveal data-d="1">
          <PanelNotes src={`${L}/config.webp`} w={477} h={919} notes={NOTES}
            alt="Phần cấu hình máy: CPU, card đồ họa, mainboard, RAM, ổ cứng và nguồn, sửa ngay trong dòng" />
        </div>
      </section>

      {/* ---------- các bước ---------- */}
      <section className="lp-sec lp-steps" aria-label="Từ khai báo tới bảng xếp hạng">
        <Stages stages={STAGES} />
      </section>

      {/* ---------- nền tảng ---------- */}
      <section className="lp-sec" aria-label="Nền tảng">
        <Platforms items={PLATFORMS} action={<Link href="/may" className="lp-btn">Mở pcdex trên web</Link>} />
      </section>

      {/* ---------- lời mời ---------- */}
      <section className="lp-cta" aria-labelledby="lp-h-cta">
        <div className="lp-tile lp-tile-photo" data-reveal>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${L}/pc-build.webp`} width={1200} height={900} alt="CPU Intel Core i7 đặt trong socket mainboard, giữa các khe RAM" loading="lazy" />
        </div>
        <div className="lp-tile lp-tile-main" data-reveal data-d="1">
          <h2 id="lp-h-cta">Chấm điểm máy bạn</h2>
          <p>Miễn phí, không cần tài khoản để bắt đầu. pcdex độc lập: giá, xếp hạng và gợi ý không ưu tiên cửa hàng hay hãng nào, công thức điểm công khai.</p>
          <Link href="/may" className="lp-btn dark">Bắt đầu</Link>
        </div>
        <div className="lp-tile lp-tile-photo" data-reveal data-d="2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${L}/board-macro.webp`} width={1024} height={683} alt="Cận cảnh đường mạch in trên bo mạch máy tính" loading="lazy" />
        </div>
      </section>

      <footer className="lp-foot">
        <span className="soft">pcdex · mạng xã hội PC</span>
        <nav aria-label="Liên kết">
          <Link href="/may">Máy của tôi</Link>
          <Link href="/xep-hang">Xếp hạng</Link>
          <Link href="/cho">Chợ</Link>
          <a href="/tai/pcdex-scan.exe" download>pcdex-scan</a>
        </nav>
        <span className="soft">2026 · <Link href="/chinh-sach-quyen-rieng-tu">Quyền riêng tư</Link> · <Link href="/dieu-khoan">Điều khoản</Link></span>
        <p className="lp-credits">Ảnh: “2015 Gaming PC Build”, Deborah Lee Soltesz, CC0, Wikimedia Commons · “Computer motherboard close up”, CC0, rawpixel.</p>
      </footer>
    </div>
  );
}
