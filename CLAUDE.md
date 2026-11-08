# f2mapp

Mạng xã hội máy tính: người dùng khai báo cấu hình PC, xem điểm sức mạnh và hạng, nhận gợi ý nâng cấp, rao bán / tìm mua linh kiện. Chạy đa nền tảng: website, Android, iOS.

## Quy định
- Trao đổi với chủ dự án bằng **tiếng Việt** (kể cả phần tóm tắt cuối mỗi lượt).
- App **độc lập, trung lập**: không gắn với cửa hàng hay thương hiệu nào (kể cả cửa hàng của chủ dự án). Giá, danh mục, gợi ý không ưu tiên người bán nào.
- **Đăng nhập**: email + mật khẩu, hoặc Google (chốt 08/11/2026). Không dùng số điện thoại / OTP. Chưa có: xác minh email, quên mật khẩu (chờ dịch vụ gửi email).
- **Chợ** (chốt 08/11/2026): chỉ đăng bán linh kiện mình sở hữu (trong máy, đang lắp hoặc đã thay ra), 5 tin / ngày, tối đa 2 máy / người. Tin có thời hạn 1/2/3/5/7/14/30 ngày; hết hạn tự hủy (status `expired`, linh kiện về kho), đăng lại / gia hạn không tính vào 5 tin. Chợ tô màu theo vòng đời: mới đăng (lime), sắp hết hạn (cam). Cả 6 loại (CPU, card, mainboard, RAM, ổ cứng, nguồn) đều bán được. Nhãn: "Xác thực đang dùng" khi phần mềm benchmark đã quét thấy linh kiện còn trong máy; còn lại "Chưa xác thực" (tự khai, chưa chạy benchmark, hoặc đã thay ra). Nguồn không quét được.
- **Giao diện** (website, app): thiết kế theo skill `ui-ux-pro-max:ui-ux-pro-max` và `taste-skill:design-taste-frontend`. Gọi cả hai skill trước khi dựng màn hình.

## Việc để sau (chủ dự án dặn nhắc lại khi xong chức năng chính)
- Dịch vụ gửi email → quên mật khẩu, xác minh email.
- Tên miền HTTPS riêng + Google OAuth Client ID → bật đăng nhập Google, `COOKIE_SECURE=1`.

## Cấu trúc (npm workspaces)
- `apps/web`: Next.js 16, App Router, Tailwind 4, bật `cacheComponents`. **Đọc `node_modules/next/dist/docs/` trước khi viết mã** (API khác bản cũ). Trang tĩnh không được đọc đồng hồ (`new Date()`) lúc dựng.
- `apps/mobile`: Expo SDK 58, Expo Router (`src/app/`). Thêm thư viện bằng `npx expo install`; đọc docs theo đúng SDK (https://docs.expo.dev/llms.txt). Không sửa tay `android/`, `ios/`.
- `apps/api`: Fastify 5 + Zod, Kysely + Postgres (`DATABASE_URL`; chưa đặt thì vẫn chạy được phần danh mục + tính điểm). Cổng dev 8140.
- `packages/shared`: công thức điểm (`src/scoring.ts`), danh mục (`src/data/parts.json`, sinh tự động), schema Zod. Dùng chung cho web, mobile, API — **mọi logic điểm nằm ở đây**, không chép sang app.
- `db/migrations`: SQL, chạy bằng `npm run migrate -w @f2m/api`.

Lệnh: `npm test`, `npm run typecheck`, `npm run dev:web|dev:api|dev:mobile`, `npm run parts`.

## Tài liệu & dữ liệu
- [docs/scoring-spec.md](docs/scoring-spec.md): đặc tả thang điểm, điểm nghẽn, luật phần cứng, huy hiệu, nguồn dữ liệu.
- [docs/design.md](docs/design.md): phong cách giao diện đã chốt (True-black flat, lime trên dữ liệu, Inter), bản sắc riêng, cách kiểm tra. Màn hình mới (web và Expo) theo tài liệu này.
- Repo: https://github.com/xmanzero/f2mapp (public — không đưa số liệu Tom's Hardware, mật khẩu, IP nhạy cảm lên).
- [prototype/tinh-diem-may.html](prototype/tinh-diem-may.html): bản mẫu tính điểm (bản đăng: https://claude.ai/artifact/6wdf3mRFPWSHDfeUZHuZn6).
- [tools/build_parts.py](tools/build_parts.py): sinh `prototype/parts.js` và `packages/shared/src/data/parts.json`. Sửa dữ liệu linh kiện ở script này rồi chạy lại.
- [tools/blender_scores.py](tools/blender_scores.py) → [data/blender-render-4.5.json](data/blender-render-4.5.json): điểm render từ Blender Open Data (CC0).
- Số liệu Tom's Hardware ([data/toms-gpu-hierarchy-2026.json](data/toms-gpu-hierarchy-2026.json)) chỉ dùng nội bộ, không đăng lại.
