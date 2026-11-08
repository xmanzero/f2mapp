import Link from "next/link";
import { pageMeta } from "@/i18n/meta";
import { getI18n } from "@/i18n/server";

export const generateMetadata = () => pageMeta("/dieu-khoan", (t) => t.pages.terms, { desc: (t) => t.seo.terms });

const CONTACT = "lienhe@pcdex.app";

export default async function Page() {
  const { locale, p } = await getI18n();
  return locale === "en" ? <TermsEn p={p} /> : <TermsVi p={p} />;
}

function TermsVi({ p }: { p: (path: string) => string }) {
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
        <p>Cách pcdex thu thập và dùng dữ liệu được nêu trong <Link href={p("/chinh-sach-quyen-rieng-tu")} className="card-link">Chính sách quyền riêng tư</Link>.</p>

        <h2>Liên hệ</h2>
        <p><a href={`mailto:${CONTACT}`} className="card-link">{CONTACT}</a></p>
      </section>
    </article>
  );
}

function TermsEn({ p }: { p: (path: string) => string }) {
  return (
    <article className="legal">
      <div className="title-row"><div>
        <h1>Terms of use</h1>
        <p className="sub">Applies to the pcdex.app website, the pcdex app and the pcdex-scan software. Last updated November 8, 2026. The Vietnamese version prevails if the two differ.</p>
      </div></div>

      <section className="panel">
        <h2>Accounts</h2>
        <p>You are responsible for keeping your account and password safe. One real account per person; don’t create accounts in bulk or impersonate others.</p>

        <h2>Scores, tiers and picks</h2>
        <p>Power scores, estimated FPS and upgrade picks are computed with pcdex’s public formula from benchmark data and manufacturer specs. They are estimates for reference, not a promise of real-world performance. The “Verified in use” badge means pcdex-scan found the part in the PC at the time of the scan.</p>

        <h2>Parts market</h2>
        <ul>
          <li>pcdex is a listing board, <b>not a seller</b>; it holds no money and is not a party to any deal. Buying, delivery and warranty are agreed between buyer and seller.</li>
          <li>Only list parts you actually own, describe their condition truthfully, and use real photos of the item.</li>
          <li>Don’t list prohibited, counterfeit or untraceable goods, scams or unrelated ads.</li>
          <li>Meet in person and check the item before paying; be wary of requests to pay in advance.</li>
          <li>The market currently serves Vietnam: prices are in Vietnamese đồng and areas are Vietnamese provinces.</li>
        </ul>

        <h2>Your content</h2>
        <p>You keep the rights to the photos and content you post, and allow pcdex to store, resize, watermark (“pcdex”) and display them on pcdex. pcdex may hide or delete content that breaks these terms and lock accounts that repeatedly do so.</p>

        <h2>pcdex-scan</h2>
        <p>The software only reads hardware information, doesn’t change your PC, and only sends data when you click “Link to account”. Don’t use the software or API to send fake data to obtain verification badges.</p>

        <h2>Limitation of liability</h2>
        <p>pcdex is provided “as is”. We work to keep the service stable and the numbers accurate but are not liable for losses arising from deals between users or from relying on estimates.</p>

        <h2>Privacy</h2>
        <p>How pcdex collects and uses data is described in the <Link href={p("/chinh-sach-quyen-rieng-tu")} className="card-link">Privacy policy</Link>.</p>

        <h2>Contact</h2>
        <p><a href={`mailto:${CONTACT}`} className="card-link">{CONTACT}</a></p>
      </section>
    </article>
  );
}
