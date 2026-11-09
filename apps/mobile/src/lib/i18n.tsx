import { getLocales } from "expo-localization";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setApiLang } from "./api";
import { storage } from "./storage";

export type Locale = "vi" | "en";

/** Chữ của app (tiếng Việt gốc, tiếng Anh cùng cấu trúc). Câu nhận xét / gợi ý lấy từ packages/shared theo `lang`. */
const vi = {
  tabs: { machine: "Máy", board: "Xếp hạng", market: "Chợ", messages: "Tin nhắn", me: "Tôi" },
  common: {
    loading: "Đang tải…", retry: "Thử lại", cancel: "Hủy", close: "Đóng", save: "Lưu", error: "Có lỗi xảy ra",
    login: "Đăng nhập", logout: "Đăng xuất", register: "Tạo tài khoản", openWeb: "Mở trên web", points: "điểm",
  },
  auth: {
    title: "Đăng nhập pcdex", registerTitle: "Tạo tài khoản pcdex", email: "Email", password: "Mật khẩu", name: "Tên hiển thị",
    submit: "Đăng nhập", submitRegister: "Tạo tài khoản", toRegister: "Chưa có tài khoản? Tạo tài khoản",
    toLogin: "Đã có tài khoản? Đăng nhập", forgot: "Quên mật khẩu (mở trên web)", needLogin: "Đăng nhập để dùng chức năng này.",
  },
  machine: {
    title: "Máy của tôi", guest: "Đăng nhập để xem điểm máy, hạng và gợi ý nâng cấp. Khai báo máy trên web hoặc quét bằng pcdex-scan.",
    empty: "Tài khoản chưa có máy nào.", emptyHint: "Chạy pcdex-scan trên máy tính, bấm “Gắn vào tài khoản” rồi quét mã QR bằng app — hoặc khai báo trên web.",
    scan: "Quét mã QR từ pcdex-scan", addOnWeb: "Khai báo trên web", power: "Điểm sức mạnh",
    tier: (n: string) => `Hạng ${n}`, times: (x: string) => `Gấp ${x} lần máy mốc (i5-12400F + RTX 3060)`,
    gaming: "Gaming", render: "Đồ họa", ai: "AI", fps: "Khung hình (game AAA, Ultra)", yourScreen: "màn hình của bạn",
    config: "Cấu hình", verified: "Xác thực", laptop: "Laptop", desktop: "Máy bàn",
    bench: "Hiệu năng đo thật", benchPct: (pct: number) => `${pct}% trung bình cùng mẫu`, editOnWeb: "Sửa cấu hình trên web",
    kinds: { cpu: "CPU", gpu: "Card đồ họa", mainboard: "Mainboard", ram: "RAM", storage: "Ổ cứng", psu: "Nguồn", model: "Model" } as Record<string, string>,
  },
  board: { title: "Bảng xếp hạng", desktop: "Máy bàn", laptop: "Laptop", empty: "Chưa có máy nào ở nhóm này.", benched: "Đã đo" },
  market: {
    title: "Chợ linh kiện", search: "Tìm linh kiện: RTX 3060, i5-12400F…", empty: "Chưa có tin nào.",
    condition: { new: "Mới", like_new: "Như mới", used: "Đã dùng", for_parts: "Hỏng, bán xác" } as Record<string, string>,
    seller: "Người bán", contact: "Liên hệ", warranty: (m: number | null) => (m ? `Bảo hành ${m} tháng` : "Không bảo hành"),
    message: "Nhắn tin cho người bán", mine: "Tin của bạn", loginToContact: "Đăng nhập để xem liên hệ và nhắn tin",
    photosNone: "Người bán chưa đăng ảnh",
  },
  msg: {
    title: "Tin nhắn", empty: "Chưa có tin nhắn nào. Nhắn cho người bán từ một tin rao trong Chợ.", placeholder: "Nhập tin nhắn…",
    send: "Gửi", photo: "Ảnh", you: "Bạn: ", blocked: "Bạn đã chặn người này.", cannotSend: "Không gửi được tin nhắn cho người này.",
    first: (name: string) => `Bắt đầu trò chuyện với ${name}. Không chuyển tiền trước khi xem hàng.`, about: "Về tin rao",
  },
  safety: {
    block: "Chặn", unblock: "Bỏ chặn", report: "Báo cáo", blockConfirm: (n: string) => `Chặn ${n}? Hai bên sẽ không nhắn tin, không theo dõi được nhau.`,
    reportTitle: "Lý do báo cáo", sent: "Đã gửi báo cáo. Cảm ơn bạn.",
    reasons: { spam: "Spam, quảng cáo", scam: "Lừa đảo, đòi chuyển tiền trước", harassment: "Quấy rối, lăng mạ", inappropriate: "Nội dung không phù hợp", other: "Lý do khác" } as Record<string, string>,
  },
  profile: {
    follow: "Theo dõi", following: "Đang theo dõi", message: "Nhắn tin", followers: (n: string) => `${n} người theo dõi`,
    followingN: (n: string) => `đang theo dõi ${n}`, machines: "Máy", listings: "Đang bán", noMachine: "Chưa khai báo máy.",
    like: "Thích", liked: "Đã thích",
  },
  me: {
    title: "Tôi", guest: "Đăng nhập để lưu máy, nhắn tin với người bán và theo dõi người khác.", profile: "Hồ sơ công khai",
    feed: "Bảng tin", scan: "Quét mã từ pcdex-scan", language: "Ngôn ngữ", web: "Quản lý trên web",
  },
  feed: { title: "Bảng tin", empty: "Chưa có hoạt động nào. Theo dõi người khác để thấy họ đổi linh kiện, lên hạng, đăng tin bán." },
  scan: {
    title: "Quét mã máy", permission: "Cần quyền camera để quét mã QR trên phần mềm pcdex-scan.", allow: "Cho phép camera",
    hint: "Hướng camera vào mã QR trên pcdex-scan (hoặc nhập mã 8 ký tự).", code: "Mã quét", lookup: "Xem kết quả",
    found: "Kết quả quét", newMachine: "Tạo máy mới", update: (n: string) => `Cập nhật “${n}”`, done: "Đã gắn vào tài khoản",
    unknown: "Có linh kiện chưa có trong danh mục — hoàn tất trên web để chọn mẫu gần nhất.", expired: "Mã đã hết hạn hoặc đã dùng. Quét lại trên máy tính.",
    full: "Tài khoản đã đủ 2 máy: chọn cập nhật một máy đang có.",
  },
};
type Dict = typeof vi;
const en: Dict = {
  tabs: { machine: "My PC", board: "Ranks", market: "Market", messages: "Messages", me: "Me" },
  common: {
    loading: "Loading…", retry: "Try again", cancel: "Cancel", close: "Close", save: "Save", error: "Something went wrong",
    login: "Sign in", logout: "Sign out", register: "Create account", openWeb: "Open on the web", points: "points",
  },
  auth: {
    title: "Sign in to pcdex", registerTitle: "Create a pcdex account", email: "Email", password: "Password", name: "Display name",
    submit: "Sign in", submitRegister: "Create account", toRegister: "No account? Create one",
    toLogin: "Have an account? Sign in", forgot: "Forgot password (opens the web)", needLogin: "Sign in to use this.",
  },
  machine: {
    title: "My PC", guest: "Sign in to see your PC’s score, tier and upgrade tips. Add your PC on the web or scan it with pcdex-scan.",
    empty: "No PC on your account yet.", emptyHint: "Run pcdex-scan on your computer, tap “Link to pcdex account”, then scan the QR code with the app — or add it on the web.",
    scan: "Scan the QR code from pcdex-scan", addOnWeb: "Add on the web", power: "Power score",
    tier: (n: string) => `${n} tier`, times: (x: string) => `${x}× the reference PC (i5-12400F + RTX 3060)`,
    gaming: "Gaming", render: "Creative", ai: "AI", fps: "Frame rate (AAA games, Ultra)", yourScreen: "your screen",
    config: "Configuration", verified: "Verified", laptop: "Laptop", desktop: "Desktop",
    bench: "Measured performance", benchPct: (pct: number) => `${pct}% of the model average`, editOnWeb: "Edit on the web",
    kinds: { cpu: "CPU", gpu: "Graphics card", mainboard: "Motherboard", ram: "RAM", storage: "Storage", psu: "PSU", model: "Model" },
  },
  board: { title: "Leaderboard", desktop: "Desktops", laptop: "Laptops", empty: "No PCs in this group yet.", benched: "Benchmarked" },
  market: {
    title: "Parts market", search: "Search parts: RTX 3060, i5-12400F…", empty: "No listings yet.",
    condition: { new: "New", like_new: "Like new", used: "Used", for_parts: "For parts" },
    seller: "Seller", contact: "Contact", warranty: (m: number | null) => (m ? `${m}-month warranty` : "No warranty"),
    message: "Message seller", mine: "Your listing", loginToContact: "Sign in to see contact details and message",
    photosNone: "No photos yet",
  },
  msg: {
    title: "Messages", empty: "No messages yet. Message a seller from a listing in the Market.", placeholder: "Type a message…",
    send: "Send", photo: "Photo", you: "You: ", blocked: "You blocked this person.", cannotSend: "You can’t message this person.",
    first: (name: string) => `Start chatting with ${name}. Don’t pay before you see the item.`, about: "About the listing",
  },
  safety: {
    block: "Block", unblock: "Unblock", report: "Report", blockConfirm: (n: string) => `Block ${n}? Neither of you will be able to message or follow the other.`,
    reportTitle: "Why are you reporting?", sent: "Report sent. Thank you.",
    reasons: { spam: "Spam or ads", scam: "Scam, asking for payment upfront", harassment: "Harassment or abuse", inappropriate: "Inappropriate content", other: "Something else" },
  },
  profile: {
    follow: "Follow", following: "Following", message: "Message", followers: (n: string) => `${n} followers`,
    followingN: (n: string) => `${n} following`, machines: "PCs", listings: "For sale", noMachine: "No PC added yet.",
    like: "Like", liked: "Liked",
  },
  me: {
    title: "Me", guest: "Sign in to save your PC, message sellers and follow people.", profile: "Public profile",
    feed: "Feed", scan: "Scan a code from pcdex-scan", language: "Language", web: "Manage on the web",
  },
  feed: { title: "Feed", empty: "Nothing here yet. Follow people to see their part swaps, tier-ups and listings." },
  scan: {
    title: "Scan a PC", permission: "Camera access is needed to scan the QR code shown in pcdex-scan.", allow: "Allow camera",
    hint: "Point the camera at the QR code in pcdex-scan (or type the 8-character code).", code: "Scan code", lookup: "View result",
    found: "Scan result", newMachine: "Create a new PC", update: (n: string) => `Update “${n}”`, done: "Linked to your account",
    unknown: "Some parts aren’t in the catalog yet — finish on the web to pick the closest model.", expired: "The code has expired or was used. Scan again on your computer.",
    full: "You already have 2 PCs: choose one to update.",
  },
};

const KEY = "f2m.lang";
const Ctx = createContext<{ locale: Locale; t: Dict; setLocale: (l: Locale) => void }>({ locale: "vi", t: vi, setLocale: () => {} });

/** Mặc định tiếng Việt khi máy đặt tiếng Việt hoặc vùng Việt Nam (như pcdex-scan), còn lại tiếng Anh; lựa chọn nhớ trên máy */
function systemLocale(): Locale {
  const l = getLocales()[0];
  return l?.languageCode === "vi" || l?.regionCode === "VN" ? "vi" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(systemLocale);
  useEffect(() => { storage.get(KEY).then((v) => { if (v === "vi" || v === "en") setLocaleState(v); }); }, []);
  useEffect(() => { setApiLang(locale); }, [locale]);
  const value = useMemo(() => ({
    locale, t: locale === "en" ? en : vi,
    setLocale: (l: Locale) => { setLocaleState(l); void storage.set(KEY, l); },
  }), [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  const nf = c.locale === "en" ? "en-US" : "vi-VN";
  return {
    ...c,
    n0: (x: number) => Math.round(x).toLocaleString(nf),
    vnd: (x: number) => `${Math.round(x).toLocaleString(nf)} ₫`,
    ago: (iso: string) => {
      const s = (new Date(iso).getTime() - Date.now()) / 1000;
      const f = new Intl.RelativeTimeFormat(nf, { numeric: "auto" });
      for (const [u, n] of [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]] as const)
        if (Math.abs(s) >= n) return f.format(Math.round(s / n), u);
      return f.format(0, "second");
    },
  };
}
