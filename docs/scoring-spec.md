# Đặc tả thang điểm sức mạnh PC (v0.5)

Tài liệu cho nhóm phát triển. Mô tả cách app chấm điểm linh kiện và cả máy, phát hiện điểm nghẽn, kiểm tra phần cứng và gợi ý nâng cấp. Bản mẫu chạy được: [prototype/tinh-diem-may.html](../prototype/tinh-diem-may.html).

Trạng thái: bản nháp. Mục 9 liệt kê những gì còn là số ước tính.

App là sản phẩm **độc lập, trung lập**: không gắn với cửa hàng hay thương hiệu nào. Điểm số, gợi ý nâng cấp và nguồn giá không được ưu tiên người bán nào.

---

## 1. Nguyên tắc

1. **Mốc cố định, không có trần.** RTX 3060 12GB = 10.000 điểm GPU, Core i5-12400F = 10.000 điểm CPU. Mốc không bao giờ đổi. Linh kiện mới mạnh hơn thì có điểm cao hơn, còn điểm của máy cũ giữ nguyên qua các năm. Chỉ **hạng** tụt dần khi thang hạng được nâng.
2. **Máy mốc = 10.000 ở mọi điểm con và ở điểm sức mạnh.** i5-12400F + RTX 3060 12GB + 16 GB RAM kênh đôi + SSD NVMe Gen3 + khe PCIe 4.0.
3. **Không cộng dồn.** Điểm cả máy dùng trung bình điều hòa có trọng số (giống PassMark Rating, 3DMark Time Spy) hoặc mô hình khung hình. Linh kiện yếu nhất kéo điểm xuống mạnh nhất.
4. **Công khai và có phiên bản.** Công thức đăng ở trang "Cách chúng tôi chấm điểm". Mỗi lần đổi trọng số thì tăng phiên bản thang điểm và lưu kèm điểm. Bài học từ UserBenchmark (2019): đổi trọng số âm thầm làm mất uy tín.

## 2. Điểm linh kiện

### CPU
| Trường | Ý nghĩa | Nguồn |
|---|---|---|
| `gaming` | Khả năng nuôi khung hình trong game (CPU cache lớn như X3D cao hơn hẳn) | Tom's Hardware CPU Hierarchy, điểm gaming 1080p. 12400F không có trong bảng: nội suy 54,2% từ i5-14400 |
| `single` | Đơn nhân: độ phản hồi khi dùng hằng ngày | Tom's Hardware CPU Hierarchy, điểm đơn nhân |
| `render` | Đa nhân / render | **Blender Open Data** (tự động) |
| `socket`, `memory` | LGA1700, AM5…; DDR4/DDR5 | Thông số hãng |
| `power_w` | Công suất tối đa | Thông số hãng |

### GPU
| Trường | Ý nghĩa | Nguồn |
|---|---|---|
| `fps[1080p, 1440p, 4K]` | FPS đo thật, game AAA thiết lập Ultra (máy test Ryzen 7 9800X3D) | Tom's Hardware GPU Hierarchy 2026. FPS 1080p của card đầu bảng = max(đo 1080p, đo 1440p ÷ 0,70) vì máy test bị CPU giới hạn |
| `raster` (điểm sức mạnh hiển thị) | FPS 1440p ÷ 41,9 (FPS của RTX 3060) × 10.000 | Suy từ trên |
| `rt` | Ray tracing: FPS ray tracing 1440p ÷ 20,7 × 10.000 (null nếu không hỗ trợ) | Như trên |
| `render` | Render 3D | **Blender Open Data** (tự động) |
| `vram_gb`, `pcie_lanes` | VRAM, số làn PCIe (x4/x8/x16) | Thông số hãng |
| `board_power_w`, `psu_recommended_w` | Công suất card, nguồn hãng khuyến nghị | Thông số hãng |
| `release_year` | Năm ra mắt (huy hiệu Lão làng) | Thông số hãng |

Danh mục hiện có 39 CPU và 55 card, sinh bằng [tools/build_parts.py](../tools/build_parts.py) → `prototype/parts.js`. Linh kiện đời cũ không có trong bảng Tom's Hardware (GTX 10/16, RTX 2060, Intel đời 10–11, Ryzen 3000/5000…) vẫn là số ước tính, đánh dấu `src: est`.

> Điểm render **không thay được** điểm game. Khi so dữ liệu Blender với điểm game: card RTX render mạnh hơn điểm game 25–40% (nhờ OptiX), còn GTX đời cũ và card AMD yếu hơn 40–70%. Mỗi loại điểm phải lấy từ đúng nguồn của nó.

### Điểm phụ
- VRAM: 12 GB = 10.000, tỉ lệ thuận.
- RAM: 8 / 16 / 32 / 64 / 128 GB = 5.000 / 10.000 / 14.000 / 17.000 / 19.000; kênh đơn × 0,85.
- Ổ hệ điều hành: HDD 2.000 · SATA 7.000 · NVMe Gen3 10.000 · Gen4 12.000 · Gen5 13.000.

## 3. Mô hình khung hình và điểm nghẽn

CPU quyết định số khung hình tối đa nó nuôi được, **không đổi theo độ phân giải**. Card đồ họa cho số khung hình **giảm dần** khi tăng độ phân giải. Khung hình thực tế gần bằng bên nhỏ hơn.

Đơn vị là **FPS thật** (game AAA, thiết lập Ultra, theo bộ game của Tom's Hardware 2026).

```
FPS_GPU(R) = gpu.fps[R] × f_PCIe
FPS_CPU    = cpu.gaming / 10.000 × 120 × f_RAM          i5-12400F ≈ 120 FPS ở 1080p Ultra
FPS(R)     = (FPS_GPU⁻⁶ + FPS_CPU⁻⁶)^(−1/6)          min mềm: gần bằng bên nhỏ hơn, không gãy góc
Nghẽn(R)   = 1 − min/max; bên nhỏ hơn là bên nghẽn
```

Hiệu chỉnh: card đầu bảng trong bảng Tom's bị CPU máy test (9800X3D) giới hạn ở 1080p, nên suy ra 9800X3D ≈ 215 FPS. Điểm gaming 9800X3D / 12400F = 1,79, tức 12400F ≈ 120 FPS (gấp 1,95 lần FPS của RTX 3060). Số mũ 6 của min mềm được chọn để khớp số đo:

| Ghép với 9800X3D | Mô hình | Đo thật |
|---|---|---|
| RTX 4090 | 187 FPS | 183,6 |
| RTX 5090 | 200 FPS | 203,8 |
| RTX 4070 | 111 FPS | 111,5 |

| Hệ số | Giá trị |
|---|---|
| VRAM | Không cần hệ số riêng: FPS đo ở từng độ phân giải đã gồm việc card 8 GB tụt mạnh ở 4K |
| `f_PCIe` (khe 3.0) | card x4: 0,80 · card x8: 0,94 nếu 8 GB VRAM, 0,97 nếu nhiều hơn · x16: 1,00 |
| `f_RAM` (phía CPU) | kênh đơn × 0,90 · 8 GB × 0,90 |

Ngưỡng hiển thị: nghẽn ≤ 10% là **cân bằng**; CPU nghẽn > 15% thì **cảnh báo**; card nghẽn là **bình thường** khi chơi game (card chạy hết công suất), chỉ gợi ý nâng card nếu muốn tăng FPS.

> Đã sửa so với tài liệu tham khảo ban đầu: tài liệu đó nhân điểm CPU × 1,30 và GPU × 0,85 ở 1080p, làm CPU trông mạnh hơn và kết luận ngược (GPU nghẽn ở 1080p). Ngoài ra điểm CPU = 0,6 đơn nhân + 0,4 đa nhân không phản ánh CPU X3D trong game, nên dùng trường `gaming` riêng.

## 4. Điểm cả máy: hai lớp

Bốn điểm con (Gaming, Đồ họa, AI, Văn phòng) cùng lấy máy mốc = 10.000 nhưng **không cùng ý nghĩa**. Đặt cạnh nhau, người dùng sẽ đọc "Gaming 13.000, Văn phòng 8.500" thành "chơi game giỏi mà văn phòng kém", trong khi máy đó làm văn phòng thoải mái. Văn phòng còn có **điểm bão hòa**: vượt mức tối thiểu thì nhanh hơn cũng không ai cảm nhận được. Vì vậy điểm được tách thành hai lớp.

### Lớp 1: Điểm sức mạnh (một con số, để xếp hạng và khoe)

```
H(a×wa, b×wb, …) = 1 / (wa/a + wb/b + …)

Gaming = FPS(1080p) / FPS_máy_mốc(1080p) × 10.000 × (0,9 nếu RAM 8 GB)
Đồ họa = H(CPU render 0,50; GPU render 0,30; RAM 0,20)
AI     = H(VRAM 0,60; GPU raster 0,30; RAM 0,10)

Điểm sức mạnh = 0,50 Gaming + 0,30 Đồ họa + 0,20 AI        (trọng số đã chốt 07/11/2026)
```

Chỉ gồm việc nặng. **Văn phòng không tính vào điểm sức mạnh.** Gaming trong điểm sức mạnh tính ở **1080p** cho mọi máy để các máy so được với nhau.

### Lớp 2: Mức đáp ứng nhu cầu (người dùng đọc là hiểu)

| Nhu cầu | Đo bằng | Các mức |
|---|---|---|
| Gaming | FPS ước tính game AAA mới, thiết lập Ultra, **ở độ phân giải màn hình của người dùng**: `FPS(R)` (× 0,9 nếu RAM 8 GB) | < 30 Yếu · 30–59 Chơi được · 60–99 Tốt · 100–143 Rất tốt · ≥ 144 Cực mượt |
| Đồ họa | Điểm Đồ họa | < 5.000 Yếu · < 10.000 Khá · < 18.000 Tốt · < 30.000 Rất tốt · còn lại Chuyên nghiệp |
| AI | VRAM (kèm ghi chú phần mềm AI hỗ trợ card AMD/Intel kém NVIDIA) | < 6 GB Yếu (≤ 3B) · 6–8 GB Cơ bản (7–8B lượng tử hóa) · 10–12 GB Tốt (14B lượng tử hóa) · 16–20 GB Rất tốt (14B mượt) · 24 GB Chuyên sâu (32B lượng tử hóa) · ≥ 32 GB Chuyên nghiệp |
| Văn phòng | `H(CPU đơn nhân 0,50; Ổ đĩa 0,30; RAM 0,20)` | < 5.000 Yếu · < 6.500 Đủ dùng · < 8.000 Tốt · còn lại **Rất tốt (mức tối đa)** |

Máy mốc chơi game AAA mới ở 1080p Ultra được **61 FPS**, khớp số đo RTX 3060 12GB (61,5 FPS).

### Hạng (theo điểm sức mạnh)
| Hạng | Điểm |
|---|---|
| Đồng | < 5.000 |
| Bạc | 5.000 – 8.999 |
| Vàng | 9.000 – 13.999 (máy mốc ở đây) |
| Bạch kim | 14.000 – 19.999 |
| Kim cương | 20.000 – 25.999 |
| Huyền thoại | ≥ 26.000 |

### Huy hiệu

Huy hiệu hiện **kèm** hạng, không thay hạng. Một máy có thể có nhiều huy hiệu.

Mỗi huy hiệu kèm một dòng mô tả tích cực, tránh cảm giác chế giễu người dùng.

| Huy hiệu | Điều kiện | Dòng mô tả |
|---|---|---|
| Nghèo vượt khó | Điểm sức mạnh < 3.000 (chốt 07/11/2026) | Máy yếu mà vẫn chiến được, đáng nể! |
| Lão làng | CPU và card đồ họa đều ra mắt ≥ 6 năm trước (cần trường `release_year` cho linh kiện) | CPU và card đồ họa đã hơn 6 năm tuổi mà vẫn chạy tốt |
| Lệch pha | CPU kìm card > 30% **ở độ phân giải màn hình của người dùng**. Không xét cố định ở 1080p, vì ở 1080p không CPU nào theo kịp card đầu bảng | CPU đang kìm card đồ họa hơn 30% |
| Thợ AI | Card từ 24 GB VRAM | Chạy được mô hình AI cỡ lớn |
| Đỉnh nóc kịch trần | Top 1% điểm sức mạnh trong toàn bộ người dùng (tính khi có dữ liệu thật) | — |

Huy hiệu "Nghèo vượt khó" và "Lệch pha" là điểm vào tự nhiên cho gợi ý nâng cấp: đặt nút "Lên đời nhẹ nhàng" ngay dưới.

### Kết quả máy mẫu (v0.5)
| Máy (màn hình) | Gaming | Đồ họa | AI | Điểm sức mạnh | Hạng | Đáp ứng Gaming | Đồ họa | AI | Văn phòng |
|---|---|---|---|---|---|---|---|---|---|
| Máy mốc: i5-12400F + RTX 3060 12GB (1080p) | 10.000 | 10.000 | 10.000 | **10.000** | Vàng | Tốt ~61 FPS | Tốt | Tốt | Rất tốt |
| i3-10100F + GTX 1650, 8 GB kênh đơn, SATA (1080p) | 4.238 | 3.317 | 3.740 | **3.862** | Đồng | Yếu ~26 FPS | Yếu | Yếu | Đủ dùng |
| i3-10100F + RTX 4070 Super, PCIe 3.0 (1080p) | 13.901 | 7.554 | 11.936 | **11.604** | Vàng | Tốt ~85 FPS | Khá | Tốt | Rất tốt |
| Ryzen 5 3600 + RTX 4060, PCIe 3.0, nguồn 500 W (1080p) | 10.693 | 9.835 | 7.807 | **9.859** | Vàng | Tốt ~66 FPS | Khá | Cơ bản | Rất tốt |
| Ryzen 5 7500F + RTX 5060 Ti 16GB, 32 GB (1440p) | 16.757 | 14.449 | 14.437 | **15.600** | Bạch kim | Tốt ~73 FPS | Tốt | Rất tốt | Rất tốt |
| Ryzen 7 9800X3D + RTX 5090, 64 GB (4K) | 32.642 | 25.328 | 27.858 | **29.491** | Huyền thoại | Rất tốt ~110 FPS | Rất tốt | Chuyên nghiệp | Rất tốt |

## 5. Luật phần cứng (tầng 1, chạy trước khi tính điểm)

| Luật | Điều kiện | Mức |
|---|---|---|
| Nguồn thiếu | nguồn < max(khuyến nghị của hãng card, CPU + card + 150 W), làm tròn lên 50 W | Cảnh báo; nghiêm trọng nếu thiếu > 100 W |
| PCIe | card x4/x8 trên khe PCIe 3.0 | Cảnh báo kèm % mất |
| RAM kênh đơn | 1 thanh hoặc lắp sai khe | Cảnh báo, gợi ý lắp thêm thanh |
| RAM 8 GB | tổng 8 GB | Cảnh báo |
| Ổ HDD | hệ điều hành trên HDD | Cảnh báo |
| Socket (khi gợi ý CPU) | socket khác | Phải thay mainboard; AM5, LGA1851 chỉ DDR5 |

Bổ sung sau: khe M.2 còn trống, chiều dài card so với vỏ máy, đầu nguồn 8-pin / 12V-2x6, BIOS hỗ trợ CPU đời mới. **Không làm** kiểm tra mạch cấp điện mainboard (VRM): không có nguồn dữ liệu đáng tin.

## 6. Gợi ý nâng cấp

1. Với mỗi loại linh kiện (CPU, GPU, RAM, ổ, nguồn), lấy các ứng viên **tương thích** (mục 5).
2. Tính điểm máy sau khi thay, rồi tính `ROI = (điểm sức mạnh mới − điểm hiện tại) / giá`. Nếu người dùng chỉ quan tâm một nhu cầu (VD chỉ chơi game ở 1440p), tính ROI theo FPS hoặc mức đáp ứng của nhu cầu đó.
3. Giá phải trung lập, không gắn với cửa hàng nào:
   - **Hàng cũ:** trung vị giá các tin rao trên chính app (theo model, trong 30–90 ngày gần nhất). Đây là nguồn giá riêng của app, càng nhiều người dùng càng chính xác.
   - **Hàng mới:** khoảng giá tham khảo (trung vị nhiều nhà bán lẻ), cập nhật định kỳ. Giai đoạn sau có thể lấy qua chương trình tiếp thị liên kết của các sàn thương mại điện tử: vừa có giá nhiều người bán, vừa có doanh thu, mà không thiên vị một cửa hàng.
   - Chưa có giá thì xếp gợi ý theo điểm tăng thêm, không tính ROI.
4. Ưu tiên "việc nhỏ hiệu quả lớn": lắp thêm thanh RAM cho kênh đôi, HDD → SSD, rồi mới đến CPU/GPU.
5. Khi gợi ý thay linh kiện, tự đề nghị **đăng bán linh kiện cũ** kèm sẵn thông số và điểm.

## 7. Nguồn dữ liệu

| Nguồn | Dùng cho | Giấy phép / điều kiện | Cách dùng |
|---|---|---|---|
| [Blender Open Data](https://opendata.blender.org/download/) | CPU render, GPU render | **CC0** | Tự động: [tools/blender_scores.py](../tools/blender_scores.py) → [data/blender-render-4.5.json](../data/blender-render-4.5.json) (484 CPU, 214 GPU) |
| [Tom's Hardware GPU Hierarchy 2026](https://www.tomshardware.com/reviews/gpu-hierarchy,4388.html) | FPS 1080p/1440p/4K Ultra, ray tracing của 48 card | Bài báo công khai; chỉ dùng nội bộ, không đăng lại bảng | Tách bảng → [data/toms-gpu-hierarchy-2026.json](../data/toms-gpu-hierarchy-2026.json) → `build_parts.py` |
| [Tom's Hardware CPU Hierarchy](https://www.tomshardware.com/reviews/cpu-hierarchy,4312.html) | CPU gaming 1080p, đơn nhân | Như trên | Nhập tay trong `build_parts.py` |
| Intel ARK, trang thông số AMD/NVIDIA, Wikipedia | Socket, công suất, VRAM, làn PCIe | Chính hãng; Wikipedia CC BY-SA | Tra tay hoặc bán tự động |
| [PassMark](https://passmark.com/services/market-analysis.php) | Điểm cho hàng nghìn model cũ | **Trả phí** (khoảng 1.000 USD/năm cho trung bình GPU), không được bán lại / vẽ lại biểu đồ | Cân nhắc khi cần phủ model cũ |
| TechPowerUp GPU DB | Thông số GPU | Không có API, họ chặn người cào | Chỉ tra tay |
| pc-part-dataset (cào từ PCPartPicker) | Danh mục, kích thước | Chưa rõ giấy phép | Chỉ tham khảo |

Cập nhật Blender: tải `opendata-latest.zip` (khoảng 100 MB nén, 1,9 GB giải nén), chạy:
```bash
python -I tools/blender_scores.py <đường dẫn opendata-latest.zip> 4.5 data/blender-render-4.5.json
```
Script lấy trung vị `samples_per_minute` của 3 cảnh (monster, junkshop, classroom) trên các lượt chạy một thiết bị, rồi cộng lại giống cách trang Blender tính. Chỉ lấy model có ≥ 5 lượt mỗi cảnh. Lưu ý: dữ liệu Blender không phân biệt RTX 3060 8GB với 12GB, hay 4060 Ti 8GB với 16GB.

## 8. Tool thu thập cấu hình trên Windows

**Đã có (08/11/2026): `tools/pcdex-scan`**, C# .NET Framework 4.8 (có sẵn trong Windows 10/11 → một file exe ~50 KB, không cài, không cần quyền quản trị). Đọc thẳng WMI / registry / CfgMgr32, không dùng thư viện ngoài.

Luồng: quét → hiện cấu hình ngay (không cần tài khoản) → "Gắn vào tài khoản" gửi dữ liệu thô lên `POST /v1/scans` → nhận mã 8 ký tự + QR trỏ tới `WEB_URL/quet?ma=…` (sống 30 phút, dùng một lần) → người dùng mở trên web hoặc quét bằng điện thoại (đã đăng nhập), chọn **cập nhật máy đang có** (xem từng thay đổi) hoặc **tạo máy mới** (đủ 2 máy thì phải xóa bớt) → phần mềm tự thấy "Đã gắn".

Phần mềm chỉ gửi dữ liệu thô; **luật nhận diện nằm ở `packages/shared/src/scan.ts`** (sửa một chỗ, không phải phát hành lại phần mềm): khớp tên CPU / card với danh mục (KF ≈ K), chọn bản VRAM, chipset → thế hệ PCIe khe card, gom thanh RAM thành bộ, bỏ ổ USB. CPU / card chưa có trong danh mục: người dùng chọn mẫu gần nhất (gợi ý sẵn), mẫu tự chọn **không** được xác thực. Khi cập nhật máy, linh kiện đã khai sơ sài (thiếu tốc độ RAM, model ổ…) được khớp lỏng (`sameScannedPart`) để giữ nguyên linh kiện và tin đang bán, chỉ bổ sung chi tiết.

Chạy `pcdex-scan.exe --json <tệp>` để xuất dữ liệu thô (kiểm tra, gửi hỗ trợ). Địa chỉ máy chủ: `--server <url>` hoặc biến `PCDEX_SERVER`. `deploy.py web|all` tự build và đặt vào web ở `/tai/pcdex-scan.exe`.

Phương án ban đầu (để tham khảo): dựng trên [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) (MPL-2.0) hoặc [Hardware.Info](https://github.com/Jinjinov/Hardware.Info) (MIT).

| Dữ liệu | Cách đọc | Lưu ý |
|---|---|---|
| CPU | `Win32_Processor` → tra tên trong danh mục | **Socket không lấy từ WMI**, tra theo model |
| GPU | Tên từ `Win32_VideoController`; VRAM qua DXGI hoặc registry | `AdapterRAM` **tối đa chỉ báo 4 GB** (số 32 bit) |
| RAM | `Win32_PhysicalMemory`: dung lượng, tốc độ, khe (`DeviceLocator`/`BankLabel`) | Kênh chỉ suy ra được, cho người dùng xác nhận |
| Ổ | `MSFT_PhysicalDisk.BusType` (NVMe/SATA) + `DEVPKEY_PciDevice_MaxLinkSpeed` của bộ điều khiển NVMe (thiết bị cha) | BusType không cho biết Gen. Độ hao mòn (`MSFT_StorageReliabilityCounter.Wear`) cần quyền quản trị |
| PCIe card | Tốc độ/số làn liên kết hiện tại của thiết bị PCI | Dùng cho luật PCIe |
| Mainboard | `Win32_BaseBoard`, `Win32_BIOS` | Tra chipset → thế hệ PCIe |
| Màn hình | `EnumDisplaySettings` / DXGI | Độ phân giải để tính điểm nghẽn |
| Nguồn | **Không đọc được** | Người dùng tự khai |

Đo xác minh (huy hiệu "Đã xác minh"): chạy Blender Benchmark CLI, kết quả so được trực tiếp với dữ liệu CC0; có thể thêm `7z b` cho CPU.

**Đã làm (09/11/2026, pcdex-scan 0.5.0):** nút "Đo hiệu năng" chạy `benchmark-launcher-cli 3.3.0` (Blender 4.5.0, 3 cảnh, mỗi cảnh 30 giây) cho CPU và card, gửi `samples_per_minute` từng cảnh kèm bản quét. Điểm Blender = tổng 3 cảnh (giống Blender Open Data); điểm render đo được = điểm Blender / điểm của mốc (i5-12400F 155,74 · RTX 3060 2155,30) × 10.000, so với điểm render trung vị của cùng mẫu trong danh mục. Card đo bằng CUDA (không có OptiX) chỉ ghi điểm, không so. Ví dụ thật (i7-14700 + GTX 1660 Ti, pcdex-scan 0.5.1): CPU 294,5 điểm Blender = 18.908 điểm render = 98% trung vị (19.277); card 734,6 = 98%. **Lưu ý EcoQoS:** Windows 11 coi tiến trình chạy ẩn là việc nền và dồn sang nhân E trên CPU lai — bản 0.5.0 chưa xử lý đo được CPU 69%, card 83% trên cùng máy; 0.5.1 tắt điều tiết (`SetProcessInformation` / `ProcessPowerThrottling`) cho công cụ đo và mọi `blender.exe`. Chưa đưa số đo vào điểm sức mạnh; chưa chống giả mạo (số đo do máy người dùng gửi).

## 9. Việc còn mở

- [x] Điểm GPU (FPS 3 độ phân giải, ray tracing) và điểm CPU (gaming, đơn nhân) từ Tom's Hardware cho 48 card và khoảng 30 CPU (07/11/2026).
- [x] Bổ sung linh kiện đời cũ (09/11/2026): 76 CPU (thêm Intel 8–14, LGA1151; Ryzen 1000–8000G, 5000/7000 các bản X/G/X3D) và 89 card (RTX 20, GTX 9/10/16, RX 400/500/5000/6800/7900 GRE, Arc A). Gaming / đơn nhân của mẫu thiếu số Tom's là ước tính (`source: est`) theo tương quan với mẫu cùng kiến trúc; render lấy Blender Open Data (khớp cả tên có đuôi "Six-Core", "w/ 760M"), card chưa có OptiX / HIP thì ước tính theo hãng (`render_est`). Nhận diện: bản F ↔ bản thường dùng chung số liệu, bỏ chữ "Series", tên card ghi VRAM chọn đúng bản. Điểm đã lưu tính lại mỗi lần API khởi động (`refreshScores`).
- [ ] Thay số ước tính bằng số đo: dùng kết quả "Đo hiệu năng" của người dùng (khi đủ lượt / chống giả mạo) để hiệu chỉnh mẫu `est`. Chọn danh sách theo [Steam Hardware Survey](https://store.steampowered.com/hwsurvey) (thống kê công khai linh kiện người chơi đang dùng), về sau theo chính cấu hình người dùng app khai báo.
- [x] Hiệu chỉnh mô hình FPS theo số đo (xem mục 3).
- [ ] **Bản quyền:** số FPS của Tom's Hardware chỉ dùng nội bộ để dựng và hiệu chỉnh thang điểm. App công khai hiển thị điểm và FPS ước tính của mô hình, không đăng lại bảng của họ. Về lâu dài thay bằng số đo từ tool xác minh của chính app.
- [ ] Bổ sung danh mục laptop: CPU/GPU laptop là mục riêng, GPU ghi kèm mức công suất (TGP); chấm nguyên chiếc theo model.
- [x] Bỏ Văn phòng khỏi điểm sức mạnh, chỉ hiện mức đáp ứng (chốt 07/11/2026).
- [x] Trọng số điểm sức mạnh: Gaming 50% · Đồ họa 30% · AI 20% (chốt 07/11/2026).
- [ ] Chốt các mốc hạng.
- [ ] Quyết định có mua dữ liệu PassMark không.
