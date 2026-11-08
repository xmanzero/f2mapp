import Link from "next/link";
import { pageMeta } from "@/i18n/meta";
import { getI18n } from "@/i18n/server";

export const generateMetadata = () => pageMeta("/chinh-sach-quyen-rieng-tu", (t) => t.pages.privacy);

const CONTACT = "lienhe@pcdex.app";

export default async function Page() {
  const { locale, p } = await getI18n();
  return locale === "en" ? <PrivacyEn p={p} /> : <PrivacyVi p={p} />;
}

function PrivacyVi({ p }: { p: (path: string) => string }) {
  return (
    <article className="legal">
      <div className="title-row"><div>
        <h1>Chính sách quyền riêng tư</h1>
        <p className="sub">Áp dụng cho website pcdex.app, ứng dụng pcdex và phần mềm quét pcdex-scan. Cập nhật ngày 08/11/2026.</p>
      </div></div>

      <section className="panel">
        <h2>pcdex là gì</h2>
        <p>pcdex là mạng xã hội về máy tính: bạn khai báo cấu hình PC, xem điểm sức mạnh và thứ hạng, nhận gợi ý nâng cấp, rao bán và tìm mua linh kiện cũ. pcdex độc lập, không thuộc cửa hàng hay thương hiệu linh kiện nào.</p>

        <h2>Dữ liệu chúng tôi thu thập</h2>
        <ul>
          <li><b>Tài khoản:</b> email, tên hiển thị, tên tài khoản (@…), tỉnh / thành bạn chọn. Mật khẩu chỉ lưu dạng băm (không ai đọc được mật khẩu gốc).</li>
          <li><b>Đăng nhập bằng Google:</b> tên, email, mã định danh tài khoản Google. pcdex không đọc được Gmail, Drive, danh bạ hay dữ liệu nào khác của bạn.</li>
          <li><b>Cấu hình máy:</b> linh kiện bạn khai báo, điểm và hạng tính từ đó.</li>
          <li><b>Kết quả quét (pcdex-scan):</b> tên CPU, card đồ họa, mainboard, RAM, ổ cứng, độ phân giải màn hình, phiên bản Windows. Phần mềm <b>không</b> gửi tên máy, tên người dùng Windows, số serial hay tệp nào, và chỉ gửi khi bạn bấm “Gắn vào tài khoản”. Kết quả chưa gắn tự xóa sau 1 ngày.</li>
          <li><b>Tin rao bán:</b> linh kiện, giá, tình trạng, mô tả, khu vực, số liên hệ và ảnh bạn đăng. Ảnh được thu nhỏ và xóa toàn bộ thông tin kèm theo (EXIF, vị trí GPS) trước khi lưu.</li>
          <li><b>Kỹ thuật:</b> cookie phiên đăng nhập, cookie ghi nhớ khu vực chợ và ngôn ngữ, lựa chọn giao diện sáng / tối lưu trên trình duyệt; địa chỉ IP dùng tạm thời để chống dò mật khẩu và gửi spam. pcdex không dùng cookie quảng cáo hay công cụ theo dõi của bên thứ ba.</li>
        </ul>

        <h2>Dữ liệu được hiển thị công khai</h2>
        <ul>
          <li>Bảng xếp hạng: tên hiển thị, tên tài khoản, tỉnh / thành, cấu hình máy chính, điểm và nhãn xác thực.</li>
          <li>Chợ: nội dung tin rao và ảnh. <b>Số liên hệ chỉ hiện cho người đã đăng nhập.</b></li>
          <li>Email của bạn không bao giờ được hiển thị cho người khác.</li>
        </ul>

        <h2>Chúng tôi dùng dữ liệu để làm gì</h2>
        <p>Để chạy các chức năng của pcdex (tài khoản, tính điểm, xếp hạng, chợ), giữ an toàn cho tài khoản và hệ thống, và cải thiện danh mục linh kiện. pcdex <b>không bán</b> dữ liệu của bạn và không chia sẻ cho bên thứ ba để quảng cáo.</p>

        <h2>Nơi lưu trữ và bên cung cấp dịch vụ</h2>
        <p>Dữ liệu lưu trên máy chủ của pcdex đặt tại Việt Nam. Lưu lượng đi qua Cloudflare (bảo mật kết nối, chống tấn công). Đăng nhập Google do Google xử lý theo chính sách của Google.</p>

        <h2>Thời gian lưu</h2>
        <p>Dữ liệu được giữ đến khi bạn xóa (từng máy, từng tin) hoặc xóa tài khoản. Tin rao hết hạn được ẩn khỏi chợ. Phiên đăng nhập hết hạn sau 60 ngày không dùng.</p>

        <h2>Quyền của bạn</h2>
        <ul>
          <li>Xem và sửa thông tin trong trang <Link href={p("/tai-khoan")} className="card-link">Tài khoản</Link> và <Link href={p("/may")} className="card-link">Máy của tôi</Link>.</li>
          <li><b>Xóa tài khoản</b> bất cứ lúc nào ở cuối trang Tài khoản: toàn bộ máy, linh kiện, tin rao, ảnh và liên kết Google bị xóa vĩnh viễn ngay lập tức.</li>
          <li>Yêu cầu khác (trích xuất dữ liệu, hỏi đáp): gửi email tới <a href={`mailto:${CONTACT}`} className="card-link">{CONTACT}</a>.</li>
        </ul>

        <h2>Trẻ em</h2>
        <p>pcdex dành cho người từ 13 tuổi trở lên. Người dưới 16 tuổi nên dùng với sự đồng ý của cha mẹ hoặc người giám hộ.</p>

        <h2>Thay đổi chính sách</h2>
        <p>Khi chính sách thay đổi, ngày cập nhật ở đầu trang sẽ đổi theo; thay đổi quan trọng sẽ được thông báo trên pcdex.</p>

        <h2>Liên hệ</h2>
        <p><a href={`mailto:${CONTACT}`} className="card-link">{CONTACT}</a></p>
      </section>
    </article>
  );
}

function PrivacyEn({ p }: { p: (path: string) => string }) {
  return (
    <article className="legal">
      <div className="title-row"><div>
        <h1>Privacy policy</h1>
        <p className="sub">Applies to the pcdex.app website, the pcdex app and the pcdex-scan software. Last updated November 8, 2026. The Vietnamese version prevails if the two differ.</p>
      </div></div>

      <section className="panel">
        <h2>What pcdex is</h2>
        <p>pcdex is a social network for PCs: you declare your build, see its power score and rank, get upgrade picks, and buy or sell used parts. pcdex is independent and not owned by any store or component brand.</p>

        <h2>Data we collect</h2>
        <ul>
          <li><b>Account:</b> email, display name, username (@…), the province you choose and your language. Passwords are stored only as hashes (no one can read the original).</li>
          <li><b>Google sign-in:</b> name, email and Google account ID. pcdex cannot read your Gmail, Drive, contacts or any other Google data.</li>
          <li><b>PC build:</b> the parts you declare, and the score and rank computed from them.</li>
          <li><b>Scan results (pcdex-scan):</b> CPU, graphics card, motherboard, RAM, drive names, display resolution and Windows version. The software does <b>not</b> send your computer name, Windows user name, serial numbers or any files, and only sends data when you click “Link to account”. Unlinked results are deleted after 1 day.</li>
          <li><b>Listings:</b> the part, price, condition, description, area, contact number and photos you post. Photos are resized and stripped of all embedded data (EXIF, GPS location) before storage.</li>
          <li><b>Technical:</b> a session cookie, cookies remembering your market area and language, and your light / dark choice stored in the browser; IP addresses are used temporarily to stop password guessing and spam. pcdex uses no advertising cookies or third-party trackers.</li>
        </ul>

        <h2>Data shown publicly</h2>
        <ul>
          <li>Leaderboard: display name, username, province, main PC build, score and verification badge.</li>
          <li>Market: listing content and photos. <b>Contact numbers are shown only to signed-in users.</b></li>
          <li>Your email is never shown to other people.</li>
        </ul>

        <h2>How we use data</h2>
        <p>To run pcdex (accounts, scoring, leaderboard, market), to keep accounts and the system safe, to send the emails described below, and to improve the parts catalog. pcdex does <b>not sell</b> your data and does not share it with third parties for advertising.</p>

        <h2>Emails</h2>
        <p>pcdex sends automatic emails for your account only: welcome and email verification, password reset, password changed, sign-in from a new device, and notices if an admin locks your account or removes a listing. No marketing emails.</p>

        <h2>Where data is stored, and service providers</h2>
        <p>Data is stored on pcdex servers in Vietnam. Traffic passes through Cloudflare (connection security, attack protection). Google sign-in is handled by Google under Google’s policies.</p>

        <h2>How long we keep it</h2>
        <p>Data is kept until you delete it (each PC, each listing) or delete your account. Expired listings are hidden from the market. Sessions expire after 60 days of inactivity.</p>

        <h2>Your rights</h2>
        <ul>
          <li>View and edit your information on the <Link href={p("/tai-khoan")} className="card-link">Account</Link> and <Link href={p("/may")} className="card-link">My PC</Link> pages.</li>
          <li><b>Delete your account</b> at any time at the bottom of the Account page: all PCs, parts, listings, photos and the Google link are permanently deleted immediately.</li>
          <li>Other requests (data export, questions): email <a href={`mailto:${CONTACT}`} className="card-link">{CONTACT}</a>.</li>
        </ul>

        <h2>Children</h2>
        <p>pcdex is for people aged 13 and over. Users under 16 should have a parent’s or guardian’s consent.</p>

        <h2>Changes</h2>
        <p>When this policy changes, the date at the top changes too; important changes will be announced on pcdex.</p>

        <h2>Contact</h2>
        <p><a href={`mailto:${CONTACT}`} className="card-link">{CONTACT}</a></p>
      </section>
    </article>
  );
}
