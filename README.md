# pcdex (repo f2mapp)

Mạng xã hội máy tính: khai báo cấu hình PC, xem điểm sức mạnh và hạng, nhận gợi ý nâng cấp, rao bán / tìm mua linh kiện. Chạy trên website, Android và iOS.

## Cấu trúc

```
apps/web        Next.js 16 (App Router, Tailwind 4) — website, SEO cho trang công khai
apps/mobile     Expo SDK 58 (Expo Router) — Android + iOS
apps/api        Fastify 5 + Zod + Kysely/Postgres — API
packages/shared Kiểu dữ liệu, danh mục linh kiện, công thức điểm, luật phần cứng, schema Zod
db/migrations   Migration SQL (0001_init: users, parts, machines, machine_parts, machine_scores, listings)
tools/          Script dựng dữ liệu linh kiện (Python)
docs/           Đặc tả thang điểm
prototype/      Bản mẫu HTML tính điểm
```

## Chạy

```bash
npm install              # cài tất cả từ thư mục gốc
npm run dev:web          # http://localhost:3000
npm run dev:api          # http://localhost:8140  (copy apps/api/.env.example → .env)
npm run dev:mobile       # Expo: quét QR bằng Expo Go, hoặc nhấn a (Android) / w (web)
npm test                 # test công thức điểm + API
npm run typecheck        # kiểm tra kiểu mọi gói
```

API hiện chạy không cần database:

| Đường dẫn | Việc |
|---|---|
| `GET /v1/parts/cpus`, `/v1/parts/gpus` | Danh mục linh kiện kèm điểm |
| `POST /v1/machines/evaluate` | Tính điểm một cấu hình: điểm sức mạnh, hạng, mức đáp ứng, điểm nghẽn, cảnh báo, huy hiệu |
| `POST /v1/machines/compare` | So sánh trước / sau nâng cấp, cảnh báo socket / nguồn / PCIe |

Database: đặt `DATABASE_URL` rồi `npm run migrate -w @f2m/api`. Khi có database thì có thêm tài khoản:

| Đường dẫn | Việc |
|---|---|
| `POST /v1/auth/register`, `/login` | Đăng ký / đăng nhập bằng email + mật khẩu (scrypt; sai 5 lần khóa 15 phút) |
| `POST /v1/auth/google` | Đăng nhập Google (ID token). Email trùng tài khoản mật khẩu thì gộp, xóa mật khẩu cũ chưa xác minh |
| `POST /v1/me/password` | Đặt / đổi mật khẩu, đăng xuất các thiết bị khác (gửi thư "Mật khẩu đã đổi") |
| `POST /v1/auth/forgot`, `/reset` | Quên mật khẩu: gửi link 60 phút (luôn trả cùng một câu; 60 giây / 5 thư mỗi giờ mỗi tài khoản), đặt mật khẩu mới rồi đăng nhập, đăng xuất phiên cũ |
| `POST /v1/auth/verify-email`, `/v1/me/verify-email` | Xác minh email bằng link 48 giờ (gửi kèm thư chào mừng); gửi lại thư xác minh |
| `/v1/admin/email/templates[/:key[/preview\|/test]]`, `/v1/admin/email/log` | Quản trị: mẫu thư theo sự kiện (sửa, bật / tắt, xem trước, gửi thử, khôi phục mặc định), nhật ký gửi |
| `GET/PATCH /v1/me` | Hồ sơ |
| `GET/POST /v1/me/machines`, `PUT/DELETE /v1/me/machines/:id`, `POST /v1/me/machines/:id/primary` | Tối đa 2 máy, cấu hình chi tiết: CPU, card, mainboard, RAM (DDR, ECC/RDIMM, DIMM/SO-DIMM), ổ cứng (loại, dung lượng, sức khỏe), nguồn. Lưu theo so khớp: linh kiện đổi → "đã thay ra" |
| `DELETE /v1/me/parts/:id` | Xóa linh kiện đã thay ra khỏi kho |
| `GET/PUT /v1/me/machine` | API cũ: máy chính dạng tóm tắt |
| `GET /v1/leaderboard` | Bảng xếp hạng máy chính của mọi người |
| `GET /v1/leaderboard/:userId` | Chi tiết máy chính của một người (cấu hình đầy đủ, linh kiện đã xác thực); ai cũng xem được |
| `POST /v1/listings/:id/photos` | Thêm ảnh cho tin (thân yêu cầu là tệp JPEG/PNG/WebP, tối đa 3 MB, 5 ảnh / tin; máy chủ đổi sang WebP + dấu "pcdex", bỏ metadata) |
| `DELETE /v1/listings/:id/photos/:photoId`, `PUT /v1/listings/:id/photos` | Xóa ảnh; sắp lại thứ tự `{ order: [id…] }` (ảnh đầu là ảnh bìa) |
| `GET /v1/photos/:photoId` | Tệp ảnh (lưu đệm lâu) |
| `POST /v1/scans` | Phần mềm pcdex-scan gửi kết quả quét (không cần đăng nhập, 30 lần / giờ / IP) → mã 8 ký tự, link `/quet?ma=…`, ma trận QR, cấu hình đã nhận diện. Mã sống 30 phút, dùng một lần |
| `GET /v1/scans/:code` | Xem kết quả quét theo mã (gõ tay có gạch, chữ thường vẫn được) |
| `POST /v1/scans/:code/claim` | Gắn vào tài khoản `{ machineId \| null, cpu?, gpu?, psuW? }`: cập nhật máy đang có hoặc tạo máy mới (tối đa 2). Linh kiện đọc được → "Xác thực đang dùng" |
| `GET /v1/listings`, `/v1/listings/:id` | Tin rao đang bán (lọc `kind`, tìm `q`); số liên hệ chỉ trả cho người đã đăng nhập |
| `POST /v1/listings`, `PATCH /v1/listings/:id` | Đăng tin **chỉ từ linh kiện trong máy mình** (đang lắp hoặc đã thay ra), tối đa 5 tin / 24 giờ, mỗi linh kiện một tin, thời hạn 1–30 ngày (hết hạn tự hủy, quét mỗi phút); đổi giá, đã hẹn / đã bán / ẩn, gia hạn / đăng lại (`durationDays`) |
| `GET /v1/me/listings` | Tin của tôi + linh kiện bán được |

Phiên đăng nhập: cookie `f2m_session` (web, qua `/api` của Next) hoặc `Authorization: Bearer` (app). Biến môi trường: [apps/api/.env.example](apps/api/.env.example).

**Trước khi mở ra internet:** chạy sau HTTPS và đặt `COOKIE_SECURE=1`; điền `GOOGLE_CLIENT_IDS` (Google chỉ chấp nhận `localhost` hoặc tên miền HTTPS). Chưa có: xác minh email, quên mật khẩu (cần dịch vụ gửi email).

## Deploy (aicenter, chỉ LAN)

```bash
DEPLOY_PASS=<mật khẩu agentws> python deploy/deploy.py all   # hoặc api | web
```

Gửi mã nguồn lên `~/f2mapp/src`, build và chạy bằng [deploy/docker-compose.yml](deploy/docker-compose.yml):

| Dịch vụ | Địa chỉ | Container |
|---|---|---|
| Web | http://192.168.110.136:8141 | `f2m_web` |
| API | http://192.168.110.136:8140 | `f2m_api` (tự chạy migration khi khởi động) |
| Postgres 17 | không mở cổng | `f2m_postgres`, volume `f2m_pgdata`, mật khẩu trong `~/f2mapp/.env` |

Đã có trong DGC Dashboard (mục "Mạng xã hội").

## Dữ liệu linh kiện

Không sửa tay `packages/shared/src/data/parts.json`. Sửa [tools/build_parts.py](tools/build_parts.py) rồi chạy `npm run parts`. Công thức và nguồn dữ liệu: [docs/scoring-spec.md](docs/scoring-spec.md).
