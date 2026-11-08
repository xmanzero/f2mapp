# Thiết kế giao diện pcdex

Áp dụng cho website và app (Expo). Làm theo skill `ui-ux-pro-max` và `taste-skill` (phần màn hình ứng dụng).

## Thương hiệu: PCDEX Brand Kit 1.0 (08/11/2026)

Bộ gốc ở `PCDEX_Brand_Kit/` (logo, app icon, mascot, guideline PDF). Chủ dự án chốt cách áp dụng "kết hợp": màu theo brand kit, bố cục phẳng giữ nguyên, chữ giữ Inter.

- **Màu**: nền Deep Navy `#080F24` (thẻ `#0f1830`, khối lồng `#18233f`); **Tech Blue `#00A6FF` là màu dữ liệu** (thay lime): FPS ở màn hình của người dùng, mức tăng điểm, ô lọc đang chọn (nền `--accent-soft`). Màu "tốt" là xanh ngọc `#3ddc97` (khác màu dữ liệu để tăng / giảm vẫn rõ). Neon Purple chỉ xuất hiện trong logo và nút chính.
- **Gradient chỉ ở hai chỗ**: logo, và **nút chính** (`--cta`: Electric Blue `#1769FF` → Neon Purple `#8A2BFF`, chữ trắng, mỗi màn hình một nút). Nút / tab đang chọn khác vẫn phẳng. Không glow, không kính mờ.
- **Logo** (`components/mark.tsx`): `Mark` = symbol P (cung đo hiệu năng + mũi tên + 2 ô pixel), thân chữ P theo màu chữ (trắng trên navy, navy trên nền sáng — bản gốc trắng mất trên nền sáng). `Wordmark` = symbol + "PCDEX" Inter 800 nghiêng, "EX" gradient. Thanh bên và landing dùng logo ngang; thanh trên điện thoại chỉ dùng symbol. Trong câu văn tên vẫn viết thường "pcdex". Không kéo méo, không đổi gradient.
- **Icon**: `app/favicon.ico`, `app/icon.svg` (symbol trên nền navy bo góc), `app/apple-icon.png` (nền navy kín). Phần mềm quét dùng cùng icon (`tools/pcdex-scan/pcdex.ico`) và màu navy / Tech Blue. Dấu trên ảnh tin rao: symbol + "pcdex" trên viên navy mờ.
- **Mascot** (`components/mascot.tsx`, `public/brand/mascot.svg`, bản vector "Mascot Master"): chỉ ở onboarding (màn hình thêm máy), trạng thái trống (chợ không có tin), hướng dẫn quét (`/quet`), trang 404, ô lời mời ở landing. Không rải vào thành phần thường. Ảnh 3D 8 tư thế trong brand kit chưa dùng (khác thiết kế mascot vector, chưa rõ nguồn).
- **Chữ**: Inter (biến thiên, đủ dấu tiếng Việt) cho mọi thứ; Chakra Petch cho tiêu đề trang và số lớn. Không dùng Orbitron (thiếu dấu tiếng Việt). Cỡ 12/13/14/16/20/24/36. Số dùng `tabular-nums`, căn phải trong bảng.
- **Bo góc**: thẻ 20px, khối trong 12px, nút và pill tròn hẳn. Thẻ không viền, không đổ bóng; phân lớp bằng độ sáng nền.
- **Không dùng**: glow, kính mờ, icon trong ô màu, emoji, sparkline, nhãn chữ in hoa giãn cách; gradient ngoài logo và nút chính.

Token đầy đủ: [apps/web/src/app/globals.css](../apps/web/src/app/globals.css). Bố cục gốc (taste-skill, seed 1715617894): `.taste-skill/app/direction.json`.

## Ngày / Đêm (08/11/2026)

- Đêm là gốc; Ngày bật theo hệ điều hành hoặc nút mặt trời/mặt trăng ở thanh trên (lưu `localStorage` `f2m.theme`). Script nội tuyến trong `<head>` đặt `data-theme` trước khi vẽ trang (không nháy, theo hướng dẫn "Preventing flash" của Next 16). `?theme=dark|light` trên địa chỉ để xem thử / kiểm tra.
- Mọi màu là token trong `:root` (Đêm), `@media (prefers-color-scheme: light) :root:not([data-theme="dark"])` và `:root[data-theme="light"]` (Ngày). Ngày: nền `#eef2fa`, thẻ trắng, chữ navy `#0b1530`, màu dữ liệu `#1460e6` (Tech Blue gốc không đủ tương phản trên nền trắng).

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
- **Dấu hiệu**: symbol P của brand kit (xem mục Thương hiệu).

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

- taste-skill hướng **"The product performs"** (seed 1221121649, `.taste-skill/direction.json`), giữ màu (brand kit) và chữ của app. Ý tưởng: cấu hình máy của chính người xem thành dụng cụ chấm điểm — màn đầu là **công cụ chấm điểm sống** (chọn CPU + card → điểm, hạng, FPS 1080p/1440p/4K, chỗ nghẽn; dùng đúng công thức `packages/shared`).
- Luôn tối (token đêm đặt lại trong `.lp`), vì ảnh giao diện là bản tối. Không có thanh bên của app (`Shell` bỏ khung khi đường dẫn là `/`). CSS riêng `apps/web/src/app/landing.css`.
- Phần: màn đầu hai nửa → dải màn hình thật cuộn ngang (mảnh giữa sáng) → mảnh Cấu hình có chú thích hai lề (rê chú thích thì vùng đó sáng) → thanh trượt 4 bước → nền tảng (tab Web / Windows / Android / iOS) → hàng ô lời mời → chân trang một dòng.
- Hình: ảnh chụp giao diện thật ở `apps/web/public/landing/*.webp` (chụp lại khi giao diện đổi) + 2 ảnh CC0 (ghi nguồn ở chân trang, `credits.json`).
- Khác bản mẫu: ô lời mời nền tối, có mascot; bỏ phần "con số theo thanh trượt" (trùng màn đầu). Nút chính gradient `--cta`.
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
