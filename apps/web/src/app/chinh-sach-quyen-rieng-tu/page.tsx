import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Chính sách quyền riêng tư" };

const CONTACT = "lienhe@pcdex.app";

export default function Page() {
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
          <li><b>Kỹ thuật:</b> cookie phiên đăng nhập, cookie ghi nhớ khu vực chợ, lựa chọn giao diện sáng / tối lưu trên trình duyệt; địa chỉ IP dùng tạm thời để chống dò mật khẩu và gửi spam. pcdex không dùng cookie quảng cáo hay công cụ theo dõi của bên thứ ba.</li>
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
          <li>Xem và sửa thông tin trong trang <Link href="/tai-khoan" className="card-link">Tài khoản</Link> và <Link href="/" className="card-link">Máy của tôi</Link>.</li>
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
