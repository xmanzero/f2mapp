import type { FastifyInstance, FastifyRequest } from "fastify";

/**
 * Ngôn ngữ của API. Thông báo lỗi trong mã viết bằng tiếng Việt (ngôn ngữ gốc); khi người dùng xem bằng tiếng Anh
 * (web gửi header x-lang: en, app gửi Accept-Language) thì `message` trong phản hồi JSON được dịch theo bảng dưới.
 * Thêm thông báo mới: thêm bản tiếng Anh vào EXACT (câu cố định) hoặc PATTERNS (câu có số liệu).
 * Câu chưa có trong bảng vẫn trả tiếng Việt (test api/test/i18n.test.ts liệt kê để không sót).
 */
export type Lang = "vi" | "en";

export function reqLang(req: FastifyRequest): Lang {
  const x = req.headers["x-lang"];
  if (x === "en" || x === "vi") return x;
  const al = req.headers["accept-language"];
  const first = typeof al === "string" ? al.split(",")[0]?.trim().slice(0, 2).toLowerCase() : "";
  return first === "en" ? "en" : "vi";
}

export const EXACT: Record<string, string> = {
  "Bạn cần đăng nhập.": "You need to sign in.",
  "Chưa cấu hình SMTP hoặc đang tắt": "SMTP isn't configured or is turned off",
  "Chưa cấu hình SMTP hoặc đang tắt.": "SMTP isn't configured or is turned off.",
  "Chưa gửi được thư lúc này. Thử lại sau.": "Couldn't send the email right now. Try again later.",
  "Chưa đặt ảnh này": "This image hasn't been set",
  "Chỉ gia hạn được tin đang bán": "Only active listings can be extended",
  "Chỉ nhận ảnh JPEG, PNG hoặc WebP": "Only JPEG, PNG or WebP images are accepted",
  "Chỉ quản trị viên mới vào được.": "Admins only.",
  "Chỉ đăng bán được linh kiện có trong máy của bạn. Khai báo linh kiện ở Máy của tôi trước.": "You can only sell parts from your own PC. Add the part in My PC first.",
  "Chọn CPU gần đúng nhất trong danh mục.": "Choose the closest CPU in the catalog.",
  "Chọn card đồ họa gần đúng nhất trong danh mục.": "Choose the closest graphics card in the catalog.",
  "Chọn thời gian bán 1, 2, 3, 5, 7, 14 hoặc 30 ngày": "Choose a listing duration of 1, 2, 3, 5, 7, 14 or 30 days",
  "Chọn một linh kiện trong máy của bạn để đăng bán": "Choose a part from your PC to sell",
  "Cấu hình không hợp lệ": "Invalid build",
  "Cấu hình chưa đúng": "The build isn't valid",
  "Danh sách ảnh không hợp lệ": "Invalid photo list",
  "Danh sách ảnh không khớp": "The photo list doesn't match",
  "Dung lượng mỗi thanh chưa đúng": "Invalid size per stick",
  "Dữ liệu chưa đúng": "Invalid data",
  "Dữ liệu quét không hợp lệ": "Invalid scan data",
  "Email chưa đúng định dạng, ví dụ ten@gmail.com": "Invalid email format, e.g. name@gmail.com",
  "Email hoặc mật khẩu chưa đúng.": "Wrong email or password.",
  "Email này đã có tài khoản. Đăng nhập bằng email và mật khẩu.": "This email already has an account. Sign in with email and password.",
  "Email này đã đăng ký bằng Google. Đăng nhập bằng Google, rồi đặt mật khẩu trong trang Tài khoản.": "This email signed up with Google. Sign in with Google, then set a password on the Account page.",
  "Email đã được xác minh.": "Email already verified.",
  "Giá tối đa 200.000.000 ₫": "Maximum price is 200,000,000 ₫",
  "Giá từ 10.000 ₫": "Minimum price is 10,000 ₫",
  "Khai báo ít nhất một bộ RAM": "Declare at least one RAM kit",
  "Khai báo ít nhất một ổ cứng": "Declare at least one drive",
  "Không tìm thấy linh kiện": "Part not found",
  "Không tìm thấy máy": "PC not found",
  "Không tự theo dõi chính mình được": "You can't follow yourself",
  "Không thích máy của chính mình được": "You can't like your own PC",
  "Không tìm thấy mã quét. Kiểm tra lại mã trên phần mềm.": "Scan code not found. Check the code shown in the app.",
  "Không tìm thấy người dùng": "User not found",
  "Không tìm thấy tin": "Listing not found",
  "Không tìm thấy tài khoản": "Account not found",
  "Không tìm thấy ảnh": "Photo not found",
  "Không xác thực được tài khoản Google. Thử đăng nhập lại.": "Couldn't verify your Google account. Try signing in again.",
  "Không đọc được ảnh này. Thử ảnh JPEG hoặc PNG khác.": "Couldn't read this image. Try another JPEG or PNG.",
  "Linh kiện này đang có tin bán khác": "This part already has another listing",
  "Linh kiện này đang có tin bán": "This part is already listed",
  "Linh kiện này đã bán": "This part has been sold",
  "Linh kiện đang có tin bán: ẩn hoặc đánh dấu đã bán trước.": "The part is listed: hide it or mark it sold first.",
  "Linh kiện đang lắp trong máy: bỏ nó ra ở phần cấu hình.": "The part is installed: remove it in the build section.",
  "Link xác minh đã hết hạn hoặc đã được dùng. Vào trang Tài khoản để gửi lại.": "The verification link has expired or was already used. Send a new one from the Account page.",
  "Link đặt lại mật khẩu đã hết hạn hoặc đã được dùng. Gửi yêu cầu mới.": "The reset link has expired or was already used. Request a new one.",
  "Mã này đã được dùng. Quét lại trên máy để lấy mã mới.": "This code was already used. Rescan on the PC for a new code.",
  "Mã đã hết hạn (30 phút). Quét lại trên máy để lấy mã mới.": "The code has expired (30 minutes). Rescan on the PC for a new code.",
  "Mô tả tối đa 1.000 ký tự": "Description can be at most 1,000 characters",
  "Mật khẩu hiện tại chưa đúng.": "Current password is wrong.",
  "Mật khẩu không được trùng email": "Password can't be the same as your email",
  "Nhập email và mật khẩu.": "Enter your email and password.",
  "Nhập số Zalo hoặc điện thoại để người mua liên hệ": "Enter a Zalo or phone number for buyers to reach you",
  "Nếu email này có tài khoản pcdex, thư đặt lại mật khẩu đã được gửi. Kiểm tra hộp thư (cả mục Spam); link có hiệu lực 60 phút.":
    "If this email has a pcdex account, a password reset email has been sent. Check your inbox (and Spam); the link is valid for 60 minutes.",
  "RAM RDIMM luôn có ECC": "RDIMM RAM is always ECC",
  "Thiếu token Google.": "Missing Google token.",
  "Tin không còn hoặc đã bị ẩn": "The listing is gone or hidden",
  "Tin đã bán, không sửa ảnh được nữa": "The listing is sold; photos can't be changed",
  "Tin đã hết hạn. Chọn thời gian bán mới để đăng lại.": "The listing has expired. Choose a new duration to relist.",
  "Tài khoản chưa có email nên chưa đặt được mật khẩu.": "The account has no email, so a password can't be set.",
  "Tài khoản chưa có email.": "The account has no email.",
  "Tên hiển thị tối đa 40 ký tự": "Display name can be at most 40 characters",
  "Tên hiển thị từ 2 ký tự": "Display name needs at least 2 characters",
  "Tên tài khoản 3–20 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới": "Username: 3–20 characters, lowercase letters without accents, digits, dots, underscores",
  "Tối đa 8 thanh RAM": "At most 8 RAM sticks",
  "Đây không phải tin của bạn": "This isn't your listing",
  "Đây là mẫu gần đúng thay cho linh kiện chưa có trong danh mục, không phải linh kiện bạn sở hữu nên không đăng bán được.":
    "This is a stand-in model for a part not in the catalog, not a part you own, so it can't be sold.",
  "Đã gửi 5 thư trong 1 giờ. Thử lại sau.": "5 emails sent in the last hour. Try again later.",
  "Đăng nhập Google chưa được bật trên máy chủ.": "Google sign-in isn't enabled on the server.",
  "Đăng nhập sai 5 lần. Tài khoản tạm khóa 15 phút.": "5 failed sign-ins. The account is locked for 15 minutes.",
  "Đặt máy khác làm máy chính trước khi xóa máy này.": "Make another PC your main PC before deleting this one.",
  "Ảnh quá lớn (tối đa 3 MB)": "Image too large (max 3 MB)",
  "Không tạo được mã quét": "Couldn't create a scan code",
  "Không tạo được handle": "Couldn't create a username",
};

export const PATTERNS: [RegExp, (...m: string[]) => string][] = [
  [/^Bạn đã có (\d+) máy\. Xóa bớt một máy rồi tạo máy mới, hoặc chọn cập nhật máy đang có\.$/, (n) => `You already have ${n} PCs. Delete one to create a new PC, or update an existing one.`],
  [/^Gõ đúng tên tài khoản @(.+) để xác nhận xóa\.$/, (h) => `Type your username @${h} exactly to confirm deletion.`],
  [/^Không có CPU "(.+)" trong danh mục$/, (x) => `CPU "${x}" isn't in the catalog`],
  [/^Không có card đồ họa "(.+)" trong danh mục$/, (x) => `Graphics card "${x}" isn't in the catalog`],
  [/^Không có "(.+)" trong danh mục$/, (x) => `"${x}" isn't in the catalog`],
  [/^Mật khẩu tối đa (\d+) ký tự$/, (n) => `Password can be at most ${n} characters`],
  [/^Mật khẩu từ (\d+) ký tự$/, (n) => `Password needs at least ${n} characters`],
  [/^Mỗi ngày đăng tối đa (\d+) tin\. Bạn đã đăng đủ trong 24 giờ qua, thử lại sau\.$/, (n) => `Up to ${n} listings per day. You've reached the limit for the last 24 hours; try again later.`],
  [/^Mỗi tin tối đa (\d+) ảnh$/, (n) => `Up to ${n} photos per listing`],
  [/^Mỗi tài khoản khai báo tối đa (\d+) máy\.$/, (n) => `Each account can have up to ${n} PCs.`],
  [/^Thư có link xác minh vừa được gửi tới (.+) \(kể cả thư chào mừng khi đăng ký\)\. Chờ 1 phút rồi gửi lại nếu chưa thấy\.$/,
    (e) => `An email with a verification link was just sent to ${e} (the welcome email counts too). Wait a minute before sending again.`],
  [/^Tin đã bị quản trị viên gỡ(?:: (.+?))?\. Không mở lại được\.$/, (r) => `This listing was removed by an admin${r ? `: ${r}` : ""}. It can't be reopened.`],
  [/^Tài khoản đã bị khóa(?:: (.+?))?\. Liên hệ lienhe@pcdex\.app nếu cần\.$/, (r) => `This account is locked${r ? `: ${r}` : ""}. Contact lienhe@pcdex.app if needed.`],
  [/^Tên tài khoản "(.+)" đã có người dùng\.$/, (h) => `The username "${h}" is taken`],
  [/^Đăng nhập sai nhiều lần\. Thử lại sau (\d+) phút\.$/, (n) => `Too many failed sign-ins. Try again in ${n} minute${n === "1" ? "" : "s"}.`],
];

/** Dịch một thông báo sang ngôn ngữ người xem; câu chưa có bản dịch giữ nguyên */
export function translateMessage(msg: string, lang: Lang): string {
  if (lang === "vi") return msg;
  const exact = EXACT[msg];
  if (exact) return exact;
  for (const [re, f] of PATTERNS) {
    const m = re.exec(msg);
    if (m) return f(...m.slice(1).map((x) => x ?? ""));
  }
  return msg;
}

/** Dịch trường `message` của mọi phản hồi JSON theo ngôn ngữ của yêu cầu */
export function registerI18n(app: FastifyInstance) {
  app.addHook("preSerialization", async (req, _reply, payload) => {
    const lang = reqLang(req);
    if (lang === "vi" || !payload || typeof payload !== "object") return payload;
    const p = payload as { message?: unknown };
    if (typeof p.message === "string") return { ...p, message: translateMessage(p.message, lang) };
    return payload;
  });
}
