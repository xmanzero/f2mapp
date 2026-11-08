# Thiết kế giao diện pcdex

Áp dụng cho website và app (Expo). Làm theo skill `ui-ux-pro-max` và `taste-skill` (phần màn hình ứng dụng).

## Phong cách: True-black flat (taste-skill, seed 1715617894)

- **Nền tối, phân lớp bằng độ sáng**: nền `#0c0d0f` (đen lạnh của phần mềm theo dõi phần cứng), thẻ `#15171a`, khối lồng `#24272b`. Thẻ không viền, không đổ bóng.
- **Màu chỉ đặt trên dữ liệu**: một màu duy nhất là lime `#c6f24e` (màu chữ OSD trong game), dùng cho FPS ở màn hình của người dùng, mức tăng điểm, ô lọc đang chọn. Không tô nút, tab, menu. Lime cũng là màu "tốt".
- **Nút chính**: viên thuốc trắng chữ đen (đảo màu), mỗi màn hình tối đa một nút.
- **Chữ**: Inter (có đủ dấu tiếng Việt), 400/500/600. Cỡ 12/13/14/16/20/24/36. Số dùng `tabular-nums`, căn phải trong bảng.
- **Bo góc**: thẻ 20px, khối trong 12px, nút và pill tròn hẳn.
- **Không dùng**: gradient, glow, kính mờ, tím/indigo, icon trong ô màu, emoji, sparkline, nhãn chữ in hoa giãn cách.

Token đầy đủ: [apps/web/src/app/globals.css](../apps/web/src/app/globals.css). Thông số gốc: `.taste-skill/app/direction.json`.

## Ngày / Đêm (08/11/2026)

- Đêm là gốc; Ngày bật theo hệ điều hành hoặc nút mặt trời/mặt trăng ở thanh trên (lưu `localStorage` `f2m.theme`). Script nội tuyến trong `<head>` đặt `data-theme` trước khi vẽ trang (không nháy, theo hướng dẫn "Preventing flash" của Next 16). `?theme=dark|light` trên địa chỉ để xem thử / kiểm tra.
- Mọi màu là token trong `:root` (Đêm), `@media (prefers-color-scheme: light) :root:not([data-theme="dark"])` và `:root[data-theme="light"]` (Ngày). Ngày: nền #eef0f3, thẻ trắng, màu dữ liệu xanh ô liu #4f7f0e (lime #c6f24e không đọc được trên nền trắng).

## Màu hạng và điểm nhấn (08/11/2026)

- Mỗi hạng một màu: Đồng, Bạc, Vàng, Bạch kim, Kim cương, Huyền thoại (`--t-*` chữ/viền, `--t-*-f` nền thẻ; bản Ngày đậm hơn để đọc được). Thẻ điểm sức mạnh và thẻ top 3 nhuộm nền theo màu hạng. Không dùng nền kem (bị cấm) — Vàng ở chế độ Ngày dùng nền xám lạnh.
- Huy hiệu hạng (`components/tier.tsx`): lục giác, số vạch = bậc hạng (Đồng 1 … Huyền thoại 6).
- Sơ đồ máy (`components/machine-diagram.tsx`): bo mạch vẽ theo cấu hình (CPU, đúng số thanh RAM, card, ổ NVMe/SATA, nguồn); linh kiện xác thực đang dùng viền màu dữ liệu.
- Font thứ hai Chakra Petch (có dấu tiếng Việt) chỉ cho tiêu đề trang và số lớn (điểm, hạng, top 3); bảng và chữ thường vẫn Inter.
- Bảng xếp hạng: bục top 3 (điện thoại: dải thẻ cuộn ngang).
- Thẻ điểm ở chế độ Ngày: nền trắng, khung 2px + dải trên 6px màu hạng, bóng rất nhẹ (bóng màu đậm bị máy đo đánh FAIL "heavy-shadow"). Số điểm chạy từ 0 lên bằng `CountUp` của React Bits (chế độ `count`; chế độ `roll` làm máy đo đọc nhầm thành tiêu đề dài 4 dòng), huy hiệu hiện lên; cả hai tắt khi người dùng giảm chuyển động.

## Bản sắc riêng

- **Thước khung hình kiểu OSD**: mỗi độ phân giải một thanh. Phần tô là FPS thực tế, vạch trắng là mức CPU nuôi được, nên người dùng *nhìn thấy* điểm nghẽn.
- **Chợ gắn với điểm số**: mỗi tin rao có "Lắp vào máy bạn: +X% điểm" và "Điểm / triệu".
- **Dấu hiệu**: ba cột điểm tăng dần (thang hạng), cột cao nhất màu lime.

## Màn hình

| Màn hình | Câu hỏi chính | Khối lớn nhất |
|---|---|---|
| Máy của tôi `/may` | Máy mạnh cỡ nào, nghẽn ở đâu, nên nâng gì? | Điểm sức mạnh 36px + hạng. Dòng dưới tiêu đề là phát hiện quan trọng nhất |
| Bảng xếp hạng `/xep-hang` | Máy tôi đứng thứ mấy? | Bảng xếp theo điểm, dòng của bạn được tô nền |
| Chợ linh kiện `/cho` | Mua gì đáng tiền cho máy tôi? | Danh sách tin; dòng dưới tiêu đề là tin đáng tiền nhất cho máy bạn |

- Cấu hình sửa ngay trong dòng (select hiện như chữ), điểm cập nhật tức thì.
- Gợi ý nâng cấp có **Xem thử**: cả màn hình chuyển sang cấu hình mới, có băng "Lắp vào máy tôi / Bỏ xem thử".
- Điện thoại: thanh bên gập thành thanh dưới đáy 3 mục; bảng thành dòng hai tầng; thẻ đếm lọc cuộn ngang.

## Landing page `/` (08/11/2026)

- taste-skill hướng **"The product performs"** (seed 1221121649, `.taste-skill/direction.json`), giữ màu và chữ của app. Ý tưởng: cấu hình máy của chính người xem thành dụng cụ chấm điểm — màn đầu là **công cụ chấm điểm sống** (chọn CPU + card → điểm, hạng, FPS 1080p/1440p/4K, chỗ nghẽn; dùng đúng công thức `packages/shared`).
- Luôn tối (token đêm đặt lại trong `.lp`), vì ảnh giao diện là bản tối. Không có thanh bên của app (`Shell` bỏ khung khi đường dẫn là `/`). CSS riêng `apps/web/src/app/landing.css`.
- Phần: màn đầu hai nửa → dải màn hình thật cuộn ngang (mảnh giữa sáng) → mảnh Cấu hình có chú thích hai lề (rê chú thích thì vùng đó sáng) → thanh trượt 4 bước → nền tảng (tab Web / Windows / Android / iOS) → hàng ô lời mời → chân trang một dòng.
- Hình: ảnh chụp giao diện thật ở `apps/web/public/landing/*.webp` (chụp lại khi giao diện đổi) + 2 ảnh CC0 (ghi nguồn ở chân trang, `credits.json`).
- Khác bản mẫu: ô lời mời nền tối thay vì lime (lime chỉ trên dữ liệu); bỏ phần "con số theo thanh trượt" (trùng màn đầu).
- Máy đo (08/11/2026): 0 FAIL ở 1440/768/390; còn 4 WARN có chủ đích (khoảng nghỉ màn đầu, dải cuộn ngang, hai mảnh mờ ở mép dải, không có video vì không có clip thật phù hợp).

## Kiểm tra

```bash
T=<thư mục taste-skill>
node $T/scripts/lint.mjs --app apps/web/src
node $T/scripts/inspect.mjs --app http://localhost:3100/   # đo trên bản build: next build && next start -p 3100
```
Lần cuối (07/11/2026): cả 3 màn hình 0 FAIL, 0 WARN ở 1440 / 768 / 390.

## Dữ liệu mẫu cần thay trước khi ra mắt

[apps/web/src/data/sample.ts](../apps/web/src/data/sample.ts): 17 máy và 16 tin rao giả lập (tên người dùng, tỉnh, giá). Máy của người dùng hiện lưu trong localStorage của trình duyệt, chưa có tài khoản.
