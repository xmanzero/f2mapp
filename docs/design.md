# Thiết kế giao diện f2m

Áp dụng cho website và app (Expo). Làm theo skill `ui-ux-pro-max` và `taste-skill` (phần màn hình ứng dụng).

## Phong cách: True-black flat (taste-skill, seed 1715617894)

- **Nền tối, phân lớp bằng độ sáng**: nền `#0c0d0f` (đen lạnh của phần mềm theo dõi phần cứng), thẻ `#15171a`, khối lồng `#24272b`. Thẻ không viền, không đổ bóng.
- **Màu chỉ đặt trên dữ liệu**: một màu duy nhất là lime `#c6f24e` (màu chữ OSD trong game), dùng cho FPS ở màn hình của người dùng, mức tăng điểm, ô lọc đang chọn. Không tô nút, tab, menu. Lime cũng là màu "tốt".
- **Nút chính**: viên thuốc trắng chữ đen (đảo màu), mỗi màn hình tối đa một nút.
- **Chữ**: Inter (có đủ dấu tiếng Việt), 400/500/600. Cỡ 12/13/14/16/20/24/36. Số dùng `tabular-nums`, căn phải trong bảng.
- **Bo góc**: thẻ 20px, khối trong 12px, nút và pill tròn hẳn.
- **Không dùng**: gradient, glow, kính mờ, tím/indigo, icon trong ô màu, emoji, sparkline, nhãn chữ in hoa giãn cách.

Token đầy đủ: [apps/web/src/app/globals.css](../apps/web/src/app/globals.css). Thông số gốc: `.taste-skill/app/direction.json`.

## Bản sắc riêng

- **Thước khung hình kiểu OSD**: mỗi độ phân giải một thanh. Phần tô là FPS thực tế, vạch trắng là mức CPU nuôi được, nên người dùng *nhìn thấy* điểm nghẽn.
- **Chợ gắn với điểm số**: mỗi tin rao có "Lắp vào máy bạn: +X% điểm" và "Điểm / triệu".
- **Dấu hiệu**: ba cột điểm tăng dần (thang hạng), cột cao nhất màu lime.

## Màn hình

| Màn hình | Câu hỏi chính | Khối lớn nhất |
|---|---|---|
| Máy của tôi `/` | Máy mạnh cỡ nào, nghẽn ở đâu, nên nâng gì? | Điểm sức mạnh 36px + hạng. Dòng dưới tiêu đề là phát hiện quan trọng nhất |
| Bảng xếp hạng `/xep-hang` | Máy tôi đứng thứ mấy? | Bảng xếp theo điểm, dòng của bạn được tô nền |
| Chợ linh kiện `/cho` | Mua gì đáng tiền cho máy tôi? | Danh sách tin; dòng dưới tiêu đề là tin đáng tiền nhất cho máy bạn |

- Cấu hình sửa ngay trong dòng (select hiện như chữ), điểm cập nhật tức thì.
- Gợi ý nâng cấp có **Xem thử**: cả màn hình chuyển sang cấu hình mới, có băng "Lắp vào máy tôi / Bỏ xem thử".
- Điện thoại: thanh bên gập thành thanh dưới đáy 3 mục; bảng thành dòng hai tầng; thẻ đếm lọc cuộn ngang.

## Kiểm tra

```bash
T=<thư mục taste-skill>
node $T/scripts/lint.mjs --app apps/web/src
node $T/scripts/inspect.mjs --app http://localhost:3100/   # đo trên bản build: next build && next start -p 3100
```
Lần cuối (07/11/2026): cả 3 màn hình 0 FAIL, 0 WARN ở 1440 / 768 / 390.

## Dữ liệu mẫu cần thay trước khi ra mắt

[apps/web/src/data/sample.ts](../apps/web/src/data/sample.ts): 17 máy và 16 tin rao giả lập (tên người dùng, tỉnh, giá). Máy của người dùng hiện lưu trong localStorage của trình duyệt, chưa có tài khoản.
