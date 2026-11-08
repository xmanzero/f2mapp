# f2mapp

Mạng xã hội máy tính: người dùng khai báo cấu hình PC, xem điểm sức mạnh và hạng, nhận gợi ý nâng cấp, rao bán / tìm mua linh kiện. Chạy đa nền tảng: website, Android, iOS.

## Quy định
- **Tên sản phẩm: pcdex** (chốt 08/11/2026, viết thường; tên cũ f2m). Hướng tới đa ngôn ngữ, toàn cầu. Tên miền **https://pcdex.app** (chạy từ 08/11/2026 qua Cloudflare Tunnel riêng `cloudflared_pcdex` trên aicenter → web :8141; cookie phiên tự bật Secure khi vào bằng HTTPS, `COOKIE_SECURE=auto`, LAN http vẫn đăng nhập được); pcdex.net dự kiến chuyển hướng về. Chỉ đổi tên hiển thị; tên nội bộ giữ nguyên: repo `f2mapp`, gói `@f2m/*`, cookie `f2m_session` / `f2m_region`, khóa trình duyệt `f2m.*`, container `f2m_*`, slug / scheme Expo.
- Trao đổi với chủ dự án bằng **tiếng Việt** (kể cả phần tóm tắt cuối mỗi lượt).
- App **độc lập, trung lập**: không gắn với cửa hàng hay thương hiệu nào (kể cả cửa hàng của chủ dự án). Giá, danh mục, gợi ý không ưu tiên người bán nào.
- **Đăng nhập**: email + mật khẩu, hoặc Google (chốt 08/11/2026). Không dùng số điện thoại / OTP. Quên mật khẩu (`/quen-mat-khau` → `/dat-lai-mat-khau`, link 60 phút) và xác minh email (`/xac-minh-email`, link 48 giờ, gửi kèm thư chào mừng; gửi lại ở trang Tài khoản) chạy qua email.
- **Chợ** (chốt 08/11/2026): lọc theo khu vực (toàn quốc / tỉnh), nhớ trong tài khoản hoặc cookie `f2m_region`; mặc định theo nơi sống → tỉnh của tin đăng gần nhất → toàn quốc. chỉ đăng bán linh kiện mình sở hữu (trong máy, đang lắp hoặc đã thay ra), 5 tin / ngày, tối đa 2 máy / người. Tin có thời hạn 1/2/3/5/7/14/30 ngày; hết hạn tự hủy (status `expired`, linh kiện về kho), đăng lại / gia hạn không tính vào 5 tin. Chợ tô màu theo vòng đời: mới đăng (lime), sắp hết hạn (cam). Cả 6 loại (CPU, card, mainboard, RAM, ổ cứng, nguồn) đều bán được. Mỗi tin tối đa 5 ảnh (ảnh đầu là ảnh bìa; máy chủ đổi sang WebP 1600 px, đóng dấu "pcdex" góc dưới phải (ảnh đăng trước 08/11/2026 mang dấu "F2m"), bỏ metadata; lưu trong Postgres). Nhãn: "Xác thực đang dùng" khi phần mềm benchmark đã quét thấy linh kiện còn trong máy; còn lại "Chưa xác thực" (tự khai, chưa chạy benchmark, hoặc đã thay ra). Nguồn không quét được.
- **Phần mềm quét máy** (chốt 08/11/2026): `tools/pcdex-scan` (C# .NET Framework 4.8, Windows). Quét xong hiện cấu hình ngay; gắn vào tài khoản bằng mã + QR (web `/quet` hoặc điện thoại), người dùng chọn cập nhật máy đang có hoặc tạo máy mới (đủ 2 máy thì xóa bớt). Luật nhận diện ở `packages/shared/src/scan.ts`. Chưa có: đo hiệu năng (Blender Benchmark), ký số exe.
- **Quản trị** (`/quan-tri`, chốt 08/11/2026): vai trò `users.role` (user / admin; admin đầu tiên: @magiareapi). Người dùng: tìm, khóa / mở khóa (khóa = mất phiên, tin bị ẩn, ra khỏi bảng xếp hạng, không đăng nhập được), cấp / bỏ quyền, xóa — không tự khóa / tự hạ quyền, khóa hay xóa admin khác phải bỏ quyền trước. Tin rao: gỡ (kèm lý do, người bán không tự mở lại), khôi phục, xóa. Email: cấu hình SMTP trong bảng `app_settings`, mật khẩu mã hóa AES-256-GCM bằng `SETTINGS_KEY` (~/f2mapp/.env; đổi khóa = nhập lại mật khẩu SMTP), gửi thư thử. **Mẫu thư** (`apps/api/src/services/email.ts`, sửa trong `/quan-tri?tab=email`, lưu ở `email_templates`; không có dòng = mẫu mặc định trong mã) cho 7 sự kiện: chào mừng (tạo tài khoản), xác minh email, quên mật khẩu, mật khẩu đã đổi, đăng nhập từ thiết bị mới (trình duyệt + hệ điều hành chưa gặp, bảng `user_devices`; lần đăng nhập đầu không báo), tài khoản bị khóa, tin rao bị gỡ. Mỗi mẫu bật / tắt riêng; cú pháp `{{bien}}`, `{{#bien}}…{{/bien}}`, `**đậm**`, `[chữ](link)` (đứng riêng dòng = nút). Thư gửi nền, không chặn API; mọi kết quả (gửi / lỗi / bỏ qua) ghi `email_log`. Test dùng `deps.sendMail` giả; khi thử trên máy thật dùng email thật của mình, không dùng tên miền lạ (VD test.vn). Mọi thao tác ghi `admin_log`. Người dùng tự xóa tài khoản ở cuối trang Tài khoản.
- **Trang chủ** `/` là landing page (giới thiệu, công cụ chấm điểm sống, nền tảng); app bắt đầu ở `/may` (Máy của tôi). Xem docs/design.md mục Landing.
- **Tài khoản mới không có máy** (chốt 08/11/2026): không gán máy mẫu hay tự đưa cấu hình trên trình duyệt lên. `/may` hiện màn hình thêm máy (`components/new-machine.tsx`): quét bằng pcdex-scan, hoặc tự chọn linh kiện (các ô để trống, chỉ lưu khi chọn đủ); cấu hình khách đã khai trên trình duyệt chỉ được dùng khi người dùng bấm "Dùng cấu hình này". Thêm máy thứ hai cũng qua màn hình này. Khách chưa đăng nhập vẫn thấy máy mẫu.
- **Giao diện** (website, app): thiết kế theo skill `ui-ux-pro-max:ui-ux-pro-max` và `taste-skill:design-taste-frontend`. Gọi cả hai skill trước khi dựng màn hình.
- **Hiệu ứng chuyển động (web)**: thư viện [React Bits](https://reactbits.dev) (MIT + Commons Clause), đã khai registry `@react-bits` trong `apps/web/components.json`. Thêm thành phần: `cd apps/web && npx shadcn@latest add @react-bits/<Tên>-TS-CSS` (bản CSS thường, không dùng bản Tailwind `-TW` nếu thành phần cần token riêng). Chỉ chọn hiệu ứng hợp phong cách ở docs/design.md (không gradient / glow / kính mờ), luôn tôn trọng `prefers-reduced-motion`. Không dùng cho app Expo.

## Việc để sau (chủ dự án dặn nhắc lại khi xong chức năng chính)
- Google OAuth Client ID cho https://pcdex.app → bật đăng nhập Google (`GOOGLE_CLIENT_IDS` trong `~/f2mapp/.env`).
- Gắn pcdex.net chuyển về pcdex.app (khi mua).

## Cấu trúc (npm workspaces)
- `apps/web`: Next.js 16, App Router, Tailwind 4, bật `cacheComponents`. **Đọc `node_modules/next/dist/docs/` trước khi viết mã** (API khác bản cũ). Trang tĩnh không được đọc đồng hồ (`new Date()`) lúc dựng.
- `apps/mobile`: Expo SDK 58, Expo Router (`src/app/`). Thêm thư viện bằng `npx expo install`; đọc docs theo đúng SDK (https://docs.expo.dev/llms.txt). Không sửa tay `android/`, `ios/`.
- `apps/api`: Fastify 5 + Zod, Kysely + Postgres (`DATABASE_URL`; chưa đặt thì vẫn chạy được phần danh mục + tính điểm). Cổng dev 8140.
- `packages/shared`: công thức điểm (`src/scoring.ts`), danh mục (`src/data/parts.json`, sinh tự động), schema Zod. Dùng chung cho web, mobile, API — **mọi logic điểm nằm ở đây**, không chép sang app.
- `db/migrations`: SQL, chạy bằng `npm run migrate -w @f2m/api`.
- `tools/pcdex-scan`: phần mềm quét Windows. Build: `dotnet build tools/pcdex-scan -c Release` (cần .NET 8 SDK); `deploy.py web|all` tự build và đặt vào `/tai/pcdex-scan.exe`.

Lệnh: `npm test`, `npm run typecheck`, `npm run dev:web|dev:api|dev:mobile`, `npm run parts`.

## Tài liệu & dữ liệu
- [docs/scoring-spec.md](docs/scoring-spec.md): đặc tả thang điểm, điểm nghẽn, luật phần cứng, huy hiệu, nguồn dữ liệu.
- [docs/design.md](docs/design.md): phong cách giao diện đã chốt (True-black flat, lime trên dữ liệu, Inter), bản sắc riêng, cách kiểm tra. Màn hình mới (web và Expo) theo tài liệu này.
- Repo: https://github.com/xmanzero/f2mapp (public — không đưa số liệu Tom's Hardware, mật khẩu, IP nhạy cảm lên).
- [prototype/tinh-diem-may.html](prototype/tinh-diem-may.html): bản mẫu tính điểm (bản đăng: https://claude.ai/artifact/6wdf3mRFPWSHDfeUZHuZn6).
- [tools/build_parts.py](tools/build_parts.py): sinh `prototype/parts.js` và `packages/shared/src/data/parts.json`. Sửa dữ liệu linh kiện ở script này rồi chạy lại.
- [tools/blender_scores.py](tools/blender_scores.py) → [data/blender-render-4.5.json](data/blender-render-4.5.json): điểm render từ Blender Open Data (CC0).
- Số liệu Tom's Hardware ([data/toms-gpu-hierarchy-2026.json](data/toms-gpu-hierarchy-2026.json)) chỉ dùng nội bộ, không đăng lại.
