# f2m

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
| `POST /v1/me/password` | Đặt / đổi mật khẩu, đăng xuất các thiết bị khác |
| `GET/PATCH /v1/me`, `GET/PUT /v1/me/machine` | Hồ sơ, máy chính (lưu kèm điểm theo phiên bản thang điểm) |
| `GET /v1/leaderboard` | Bảng xếp hạng máy chính của mọi người |

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
