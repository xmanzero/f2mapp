import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Điều khoản sử dụng" };

const CONTACT = "lienhe@pcdex.app";

export default function Page() {
  return (
    <article className="legal">
      <div className="title-row"><div>
        <h1>Điều khoản sử dụng</h1>
        <p className="sub">Áp dụng cho website pcdex.app, ứng dụng pcdex và phần mềm quét pcdex-scan. Cập nhật ngày 08/11/2026.</p>
      </div></div>

      <section className="panel">
        <h2>Tài khoản</h2>
        <p>Bạn chịu trách nhiệm giữ an toàn tài khoản và mật khẩu của mình. Mỗi người dùng một tài khoản thật; không tạo tài khoản hàng loạt hay mạo danh người khác.</p>

        <h2>Điểm, hạng và gợi ý</h2>
        <p>Điểm sức mạnh, FPS ước tính và gợi ý nâng cấp được tính theo công thức công khai của pcdex từ dữ liệu benchmark và thông số hãng. Đây là ước tính để tham khảo, không phải cam kết về hiệu năng thực tế. Nhãn “Xác thực đang dùng” nghĩa là phần mềm pcdex-scan đã đọc thấy linh kiện trong máy tại thời điểm quét.</p>

        <h2>Chợ linh kiện</h2>
        <ul>
          <li>pcdex là nơi đăng tin, <b>không phải bên bán</b>, không giữ tiền và không đứng ra giao dịch. Việc mua bán, giao nhận, bảo hành là thỏa thuận giữa người mua và người bán.</li>
          <li>Chỉ đăng bán linh kiện bạn thật sự sở hữu, mô tả đúng tình trạng, ảnh chụp thật của món hàng.</li>
          <li>Không đăng hàng cấm, hàng giả, hàng không rõ nguồn gốc, nội dung lừa đảo hay quảng cáo không liên quan.</li>
          <li>Nên gặp trực tiếp, kiểm tra hàng trước khi trả tiền; cảnh giác với yêu cầu chuyển khoản trước.</li>
        </ul>

        <h2>Nội dung bạn đăng</h2>
        <p>Bạn giữ quyền với ảnh và nội dung mình đăng, và cho phép pcdex lưu trữ, thu nhỏ, đóng dấu “pcdex” và hiển thị chúng trên pcdex. pcdex có thể ẩn hoặc xóa nội dung vi phạm điều khoản và khóa tài khoản vi phạm nhiều lần.</p>

        <h2>Phần mềm pcdex-scan</h2>
        <p>Phần mềm chỉ đọc thông tin phần cứng, không thay đổi máy của bạn, và chỉ gửi dữ liệu khi bạn bấm “Gắn vào tài khoản”. Không dùng phần mềm hay API để gửi dữ liệu giả nhằm lấy nhãn xác thực.</p>

        <h2>Giới hạn trách nhiệm</h2>
        <p>pcdex được cung cấp “như hiện có”. Chúng tôi cố gắng giữ dịch vụ ổn định và số liệu chính xác nhưng không chịu trách nhiệm cho thiệt hại phát sinh từ giao dịch giữa người dùng hay từ việc dựa vào số liệu ước tính.</p>

        <h2>Quyền riêng tư</h2>
        <p>Cách pcdex thu thập và dùng dữ liệu được nêu trong <Link href="/chinh-sach-quyen-rieng-tu" className="card-link">Chính sách quyền riêng tư</Link>.</p>

        <h2>Liên hệ</h2>
        <p><a href={`mailto:${CONTACT}`} className="card-link">{CONTACT}</a></p>
      </section>
    </article>
  );
}
