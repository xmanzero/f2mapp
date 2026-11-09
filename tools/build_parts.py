"""Sinh prototype/parts.js (danh mục CPU + GPU kèm điểm) từ các nguồn dữ liệu.

Nguồn:
  - Tom's Hardware GPU Hierarchy 2026 (data/toms-gpu-hierarchy-2026.json): FPS 1080p/1440p/4K Ultra, ray tracing.
    Máy test Ryzen 7 9800X3D. Chỉ dùng nội bộ để hiệu chỉnh, không phát hành lại bảng.
  - Tom's Hardware CPU Hierarchy (số nhập tay bên dưới): điểm gaming 1080p, điểm đơn nhân.
  - Blender Open Data 4.5, CC0 (data/blender-render-4.5.json): điểm render CPU/GPU.
  - Thông số hãng: socket, công suất, VRAM, làn PCIe, nguồn khuyến nghị, năm ra mắt.

Mốc: i5-12400F = 10.000 (CPU), RTX 3060 12GB = 10.000 (GPU).
Chạy: python -I tools/build_parts.py
"""
import json, re, sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent

# ---------- CPU ----------
# Tom's CPU Hierarchy: gaming 1080p (% so với 9850X3D) và đơn nhân (% so với Core Ultra 7 270K Plus).
# 12400F không có trong bảng gaming: nội suy 54,2% (i5-14400 = 58%, 14400 ≈ 13400F + 2%, 13400F ≈ 12400F + 5%).
GM_REF, ST_REF = 54.2, 69.5
# tên, socket, gaming Tom's (None = ước tính), đơn nhân Tom's, gaming ước tính, đơn nhân ước tính (đơn vị: % của 12400F), W, năm
CPU = [
    ("Core i3-10100", "LGA1200", None, None, 72, 74, 90, 2020),
    ("Core i3-10100F", "LGA1200", None, None, 72, 74, 90, 2020),
    ("Core i5-10400F", "LGA1200", None, None, 75, 69, 135, 2020),
    ("Core i5-11400F", "LGA1200", None, None, 85, 85, 155, 2021),
    ("Core i3-12100F", "LGA1700", None, 67.3, 92, None, 89, 2022),
    ("Core i3-13100F", "LGA1700", None, 71.0, 95, None, 89, 2023),
    ("Core i5-12400F", "LGA1700", GM_REF, 69.5, None, None, 117, 2022),
    ("Core i5-13400F", "LGA1700", None, 74.0, 104, None, 148, 2023),
    ("Core i5-14400F", "LGA1700", 58.0, 75.4, None, None, 148, 2024),
    ("Core i5-12600K", "LGA1700", 60.8, 78.6, None, None, 150, 2021),
    ("Core i5-13600K", "LGA1700", 70.9, 82.4, None, None, 181, 2022),
    ("Core i5-14600K", "LGA1700", 72.8, 85.8, None, None, 181, 2023),
    ("Core i7-12700K", "LGA1700", 65.8, 79.7, None, None, 190, 2021),
    ("Core i7-13700K", "LGA1700", 75.8, 86.7, None, None, 253, 2022),
    ("Core i7-14700K", "LGA1700", 76.4, 90.1, None, None, 253, 2023),
    # bản không K: xung tối đa 5,4 GHz (K: 5,6), giới hạn công suất 219 W → ước tính ~95% bản K; render theo Blender
    ("Core i7-14700", "LGA1700", None, None, 135, 125, 219, 2024),
    ("Core i7-14700F", "LGA1700", None, None, 135, 125, 219, 2024),
    ("Core i9-13900K", "LGA1700", 76.8, 92.4, None, None, 253, 2022),
    ("Core i9-14900K", "LGA1700", 78.2, 95.4, None, None, 253, 2023),
    ("Core Ultra 5 245K", "LGA1851", 67.1, 92.5, None, None, 159, 2024),
    ("Core Ultra 7 265K", "LGA1851", 70.3, 96.8, None, None, 250, 2024),
    ("Core Ultra 9 285K", "LGA1851", 71.8, 98.5, None, None, 250, 2024),
    ("Ryzen 5 3600", "AM4", None, None, 76, 75, 88, 2019),
    ("Ryzen 5 5500", "AM4", None, 60.0, 82, None, 76, 2022),
    ("Ryzen 5 5600", "AM4", None, None, 95, 95, 76, 2022),
    ("Ryzen 7 5700X", "AM4", None, 67.0, 98, None, 76, 2022),
    ("Ryzen 7 5800X3D", "AM4", None, 65.9, 122, None, 142, 2022),
    ("Ryzen 5 7500F", "AM5", None, None, 120, 99, 88, 2023),
    ("Ryzen 5 7600", "AM5", None, None, 122, 100, 88, 2023),
    ("Ryzen 5 7600X", "AM5", 67.3, 71.5, None, None, 142, 2022),
    ("Ryzen 7 7700", "AM5", None, None, 128, 117, 88, 2023),
    ("Ryzen 7 7700X", "AM5", 70.6, 84.0, None, None, 142, 2022),
    ("Ryzen 7 7800X3D", "AM5", 85.6, 77.3, None, None, 162, 2023),
    ("Ryzen 9 7950X", "AM5", 71.0, 85.2, None, None, 230, 2022),
    ("Ryzen 5 9600X", "AM5", 72.6, 89.0, None, None, 88, 2024),
    ("Ryzen 7 9700X", "AM5", None, 90.6, 136, None, 88, 2024),
    ("Ryzen 7 9800X3D", "AM5", 97.0, 87.6, None, None, 162, 2024),
    ("Ryzen 7 9850X3D", "AM5", 100.0, 93.2, None, None, 162, 2026),
    ("Ryzen 9 9900X", "AM5", 73.9, 92.2, None, None, 162, 2024),
    ("Ryzen 9 9950X", "AM5", 76.9, 93.3, None, None, 230, 2024),
    ("Ryzen 9 9950X3D", "AM5", 95.7, 92.8, None, None, 230, 2025),
    # --- mở rộng 09/11/2026: đời cũ phổ biến (Steam Hardware Survey, chợ máy cũ Việt Nam). Gaming / đơn nhân ước tính
    #     theo tương quan với các mẫu đã có số Tom's (cùng kiến trúc, xung, cache); render lấy Blender Open Data nếu có.
    ("Core i5-8400", "LGA1151", None, None, 66, 72, 65, 2017),
    ("Core i3-9100F", "LGA1151", None, None, 60, 72, 65, 2019),
    ("Core i5-9400F", "LGA1151", None, None, 70, 75, 65, 2019),
    ("Core i7-8700K", "LGA1151", None, None, 80, 82, 95, 2017),
    ("Core i7-9700K", "LGA1151", None, None, 86, 86, 95, 2018),
    ("Core i9-9900K", "LGA1151", None, None, 88, 87, 95, 2018),
    ("Core i5-10600K", "LGA1200", None, None, 84, 84, 182, 2020),
    ("Core i7-10700F", "LGA1200", None, None, 85, 82, 224, 2020),
    ("Core i7-10700K", "LGA1200", None, None, 88, 86, 229, 2020),
    ("Core i9-10900K", "LGA1200", None, None, 91, 89, 250, 2020),
    ("Core i5-11600K", "LGA1200", None, None, 92, 95, 224, 2021),
    ("Core i7-11700F", "LGA1200", None, None, 93, 95, 224, 2021),
    ("Core i7-11700K", "LGA1200", None, None, 96, 98, 251, 2021),
    ("Core i9-11900K", "LGA1200", None, None, 98, 101, 251, 2021),
    ("Core i3-14100F", "LGA1700", None, None, 97, 104, 110, 2024),
    ("Core i7-12700F", "LGA1700", None, None, 118, 112, 180, 2022),
    ("Core i7-13700F", "LGA1700", None, None, 134, 120, 219, 2023),
    ("Core i9-12900K", "LGA1700", None, None, 124, 120, 241, 2021),
    ("Ryzen 5 1600", "AM4", None, None, 58, 64, 88, 2017),
    ("Ryzen 5 2600", "AM4", None, None, 63, 70, 88, 2018),
    ("Ryzen 7 2700X", "AM4", None, None, 66, 72, 142, 2018),
    ("Ryzen 7 3700X", "AM4", None, None, 80, 82, 88, 2019),
    ("Ryzen 9 3900X", "AM4", None, None, 82, 84, 142, 2019),
    ("Ryzen 5 4500", "AM4", None, None, 70, 78, 88, 2022),
    ("Ryzen 5 5600G", "AM4", None, None, 82, 92, 88, 2021),
    ("Ryzen 5 5600X", "AM4", None, None, 98, 96, 76, 2020),
    ("Ryzen 7 5700G", "AM4", None, None, 86, 94, 88, 2021),
    ("Ryzen 7 5800X", "AM4", None, None, 100, 98, 142, 2020),
    ("Ryzen 9 5900X", "AM4", None, None, 102, 99, 142, 2020),
    ("Ryzen 9 5950X", "AM4", None, None, 103, 100, 142, 2020),
    ("Ryzen 5 8600G", "AM5", None, None, 100, 112, 88, 2024),
    ("Ryzen 7 8700G", "AM5", None, None, 104, 116, 88, 2024),
    ("Ryzen 9 7900", "AM5", None, None, 128, 120, 88, 2023),
    ("Ryzen 9 7900X", "AM5", None, None, 131, 124, 230, 2022),
    ("Ryzen 9 7950X3D", "AM5", None, None, 157, 124, 162, 2023),
]


# ---------- laptop (09/11/2026) ----------
# CPU laptop hàn trên bo (socket "BGA"): tên, gaming ước tính, đơn nhân ước tính (% của 12400F), công suất duy trì W, năm.
# Gaming / đơn nhân ước tính theo tương quan với bản máy bàn cùng kiến trúc (xung thấp hơn, giới hạn điện năng); render lấy Blender Open Data.
CPU_LAPTOP = [
    ("Core i5-10300H", 62, 68, 45, 2020), ("Core i7-10750H", 66, 70, 45, 2020),
    ("Core i5-11400H", 76, 82, 45, 2021), ("Core i7-11800H", 80, 85, 45, 2021),
    ("Core i5-1135G7", 55, 75, 28, 2020), ("Core i7-1165G7", 58, 80, 28, 2020),
    ("Core i5-1235U", 60, 82, 15, 2022), ("Core i7-1255U", 63, 86, 15, 2022),
    ("Core i5-1335U", 62, 85, 15, 2023), ("Core i7-1355U", 65, 88, 15, 2023),
    ("Core i5-12450H", 80, 88, 45, 2023), ("Core i5-12500H", 86, 95, 45, 2022),
    ("Core i7-12650H", 88, 96, 45, 2023), ("Core i7-12700H", 92, 100, 45, 2022), ("Core i9-12900H", 96, 105, 45, 2022),
    ("Core i5-13420H", 84, 94, 45, 2023), ("Core i5-13500H", 90, 100, 45, 2023),
    ("Core i7-13620H", 94, 104, 45, 2023), ("Core i7-13700H", 96, 106, 45, 2023),
    ("Core i5-13450HX", 94, 100, 55, 2023), ("Core i7-13650HX", 106, 108, 55, 2023), ("Core i9-13900HX", 118, 118, 55, 2023),
    ("Core i7-14650HX", 110, 110, 55, 2024), ("Core i7-14700HX", 114, 112, 55, 2024), ("Core i9-14900HX", 122, 122, 55, 2024),
    ("Core Ultra 5 125U", 62, 88, 15, 2023), ("Core Ultra 7 155U", 65, 90, 15, 2023),
    ("Core Ultra 5 125H", 82, 95, 28, 2023), ("Core Ultra 7 155H", 88, 100, 28, 2023), ("Core Ultra 9 185H", 92, 104, 45, 2023),
    ("Core Ultra 5 226V", 76, 96, 17, 2024), ("Core Ultra 7 258V", 80, 100, 17, 2024),
    ("Core Ultra 5 225H", 88, 102, 28, 2025), ("Core Ultra 7 255H", 94, 108, 28, 2025),
    ("Core Ultra 7 255HX", 118, 120, 55, 2025), ("Core Ultra 9 275HX", 125, 125, 55, 2025),
    ("Ryzen 5 5500U", 55, 70, 15, 2021), ("Ryzen 7 5700U", 58, 72, 15, 2021),
    ("Ryzen 5 7530U", 62, 82, 15, 2023), ("Ryzen 7 7730U", 64, 84, 15, 2023),
    ("Ryzen 5 4600H", 62, 68, 45, 2020), ("Ryzen 7 4800H", 66, 70, 45, 2020),
    ("Ryzen 5 5600H", 76, 84, 45, 2021), ("Ryzen 7 5800H", 80, 86, 45, 2021), ("Ryzen 9 5900HX", 84, 90, 45, 2021),
    ("Ryzen 5 6600H", 80, 88, 45, 2022), ("Ryzen 7 6800H", 86, 92, 45, 2022),
    ("Ryzen 5 7535HS", 80, 88, 35, 2023), ("Ryzen 7 7735HS", 86, 92, 35, 2023),
    ("Ryzen 5 7640HS", 90, 100, 35, 2023), ("Ryzen 7 7840HS", 96, 104, 35, 2023), ("Ryzen 9 7940HS", 98, 106, 35, 2023),
    ("Ryzen 5 8645HS", 92, 100, 35, 2024), ("Ryzen 7 8845HS", 98, 106, 35, 2024),
    ("Ryzen 9 7945HX", 125, 118, 55, 2023), ("Ryzen 9 8945HX", 126, 120, 55, 2025),
    ("Ryzen AI 7 350", 94, 108, 28, 2025), ("Ryzen AI 9 HX 370", 100, 112, 28, 2024),
]
# Card laptop: tên, sức mạnh ở TGP tối đa (RTX 3060 máy bàn = 1), RT, VRAM, TGP tối thiểu / tối đa / phổ biến (W, gồm Dynamic Boost), năm.
# AMD không công bố dải TGP rõ → None (không chỉnh theo công suất).
GPU_LAPTOP = [
    ("RTX 5090 Laptop", 2.10, 2.30, 24, 95, 175, 175, 2025), ("RTX 5080 Laptop", 1.85, 2.00, 16, 80, 175, 175, 2025),
    ("RTX 5070 Ti Laptop", 1.55, 1.60, 12, 60, 140, 140, 2025), ("RTX 5070 Laptop", 1.25, 1.30, 8, 50, 115, 115, 2025),
    ("RTX 5060 Laptop", 1.15, 1.20, 8, 45, 115, 115, 2025), ("RTX 5050 Laptop", 0.95, 0.95, 8, 50, 100, 100, 2025),
    ("RTX 4090 Laptop", 1.95, 2.10, 16, 80, 175, 175, 2023), ("RTX 4080 Laptop", 1.70, 1.80, 12, 60, 175, 175, 2023),
    ("RTX 4070 Laptop", 1.20, 1.25, 8, 35, 140, 140, 2023), ("RTX 4060 Laptop", 1.10, 1.15, 8, 35, 140, 140, 2023),
    ("RTX 4050 Laptop", 0.92, 0.95, 6, 35, 140, 140, 2023),
    ("RTX 3080 Ti Laptop", 1.40, 1.45, 16, 80, 175, 175, 2022), ("RTX 3080 Laptop", 1.25, 1.30, 8, 80, 165, 150, 2021),
    ("RTX 3070 Ti Laptop", 1.18, 1.20, 8, 80, 150, 150, 2022), ("RTX 3070 Laptop", 1.08, 1.10, 8, 80, 125, 125, 2021),
    ("RTX 3060 Laptop", 0.90, 0.90, 6, 60, 130, 130, 2021),
    ("RTX 3050 Ti Laptop", 0.55, 0.50, 4, 35, 80, 80, 2021), ("RTX 3050 Laptop", 0.52, 0.48, 4, 35, 80, 80, 2021),
    ("RTX 2060 Laptop", 0.70, 0.65, 6, 80, 115, 115, 2019),
    ("GTX 1650 Ti Laptop", 0.44, None, 4, 50, 55, 55, 2020), ("GTX 1650 Laptop", 0.40, None, 4, 35, 50, 50, 2019),
    ("RX 7600S", 0.98, 0.70, 8, None, None, None, 2023),
    ("RX 6800M", 1.30, 0.90, 12, None, None, None, 2021), ("RX 6700M", 1.12, 0.75, 10, None, None, None, 2021),
    ("RX 6600M", 0.98, 0.65, 8, None, None, None, 2021),
]
# Đồ họa tích hợp đời mới (chung RAM hệ thống): tên, sức mạnh (RTX 3060 = 1), năm. Tên khác → "Đồ họa tích hợp (iGPU)".
IGPU = [
    ("Radeon 890M", 0.45, 2024), ("Radeon 880M", 0.40, 2024), ("Radeon 780M", 0.36, 2023), ("Radeon 760M", 0.30, 2023),
    ("Radeon 680M", 0.30, 2022), ("Arc 140V", 0.40, 2024), ("Arc 130V", 0.34, 2024), ("Arc Graphics", 0.32, 2023),
    ("Iris Xe Graphics", 0.18, 2020),
]
TGP_EXP = 0.4  # hiệu năng ~ (TGP / TGP tối đa)^0,4 (càng lên cao càng ít lợi)

# ---------- GPU ----------
R1440 = 0.70  # FPS 1440p ≈ 0,70 × FPS 1080p khi card không bị CPU giới hạn
REF_1440, REF_RT1440 = 41.9, 20.7  # RTX 3060 12GB
# tên trong app, tên trong bảng Tom's, VRAM, làn PCIe, công suất card W, nguồn khuyến nghị W, năm
GPU = [
    ("RTX 5090", "GeForce RTX 5090", 32, 16, 575, 1000, 2025),
    ("RTX 4090", "GeForce RTX 4090", 24, 16, 450, 850, 2022),
    ("RTX 5080", "GeForce RTX 5080", 16, 16, 360, 850, 2025),
    ("RX 7900 XTX", "Radeon RX 7900 XTX", 24, 16, 355, 800, 2022),
    ("RTX 4080 Super", "GeForce RTX 4080 Super", 16, 16, 320, 750, 2024),
    ("RTX 4080", "GeForce RTX 4080", 16, 16, 320, 750, 2022),
    ("RTX 5070 Ti", "GeForce RTX 5070 Ti", 16, 16, 300, 750, 2025),
    ("RX 9070 XT", "Radeon RX 9070 XT", 16, 16, 304, 750, 2025),
    ("RX 7900 XT", "Radeon RX 7900 XT", 20, 16, 315, 750, 2022),
    ("RTX 4070 Ti Super", "GeForce RTX 4070 Ti Super", 16, 16, 285, 700, 2024),
    ("RX 9070", "Radeon RX 9070", 16, 16, 220, 650, 2025),
    ("RTX 3090 Ti", "GeForce RTX 3090 Ti", 24, 16, 450, 850, 2022),
    ("RTX 4070 Ti", "GeForce RTX 4070 Ti", 12, 16, 285, 700, 2023),
    ("RTX 5070", "GeForce RTX 5070", 12, 16, 250, 650, 2025),
    ("RTX 3090", "GeForce RTX 3090", 24, 16, 350, 750, 2020),
    ("RTX 4070 Super", "GeForce RTX 4070 Super", 12, 16, 220, 650, 2024),
    ("RX 6950 XT", "Radeon RX 6950 XT", 16, 16, 335, 850, 2022),
    ("RTX 3080 Ti", "GeForce RTX 3080 Ti", 12, 16, 350, 750, 2021),
    ("RX 9070 GRE", "Radeon RX 9070 GRE", 12, 16, 220, 650, 2025),
    ("RX 7800 XT", "Radeon RX 7800 XT", 16, 16, 263, 700, 2023),
    ("RX 6900 XT", "Radeon RX 6900 XT", 16, 16, 300, 850, 2020),
    ("RTX 3080 10GB", "GeForce RTX 3080", 10, 16, 320, 750, 2020),
    ("RX 6800 XT", "Radeon RX 6800 XT", 16, 16, 300, 750, 2020),
    ("RTX 4070", "GeForce RTX 4070", 12, 16, 200, 650, 2023),
    ("RTX 5060 Ti 16GB", "GeForce RTX 5060 Ti 16GB", 16, 8, 180, 600, 2025),
    ("RX 7700 XT", "Radeon RX 7700 XT", 12, 16, 245, 700, 2023),
    ("RX 9060 XT 16GB", "Radeon RX 9060 XT 16GB", 16, 16, 160, 450, 2025),
    ("RTX 5060 Ti 8GB", "GeForce RTX 5060 Ti 8GB", 8, 8, 180, 600, 2025),
    ("RTX 3070 Ti", "GeForce RTX 3070 Ti", 8, 16, 290, 750, 2021),
    ("RX 9060 XT 8GB", "Radeon RX 9060 XT 8GB", 8, 16, 150, 450, 2025),
    ("RTX 4060 Ti 16GB", "GeForce RTX 4060 Ti 16GB", 16, 8, 165, 550, 2023),
    ("RX 7600 XT", "Radeon RX 7600 XT", 16, 8, 190, 600, 2024),
    ("RTX 3070", "GeForce RTX 3070", 8, 16, 220, 650, 2020),
    ("RTX 4060 Ti 8GB", "GeForce RTX 4060 Ti 8GB", 8, 8, 160, 550, 2023),
    ("RX 6750 XT", "Radeon RX 6750 XT", 12, 16, 250, 650, 2022),
    ("RTX 5060", "GeForce RTX 5060", 8, 8, 145, 550, 2025),
    ("RX 6700 XT", "Radeon RX 6700 XT", 12, 16, 230, 650, 2021),
    ("Arc B580", "Intel Arc B580", 12, 8, 190, 600, 2024),
    ("RTX 3060 Ti", "GeForce RTX 3060 Ti", 8, 16, 200, 600, 2020),
    ("RTX 4060", "GeForce RTX 4060", 8, 8, 115, 550, 2023),
    ("RX 7600", "Radeon RX 7600", 8, 8, 165, 550, 2023),
    ("RTX 5050", "GeForce RTX 5050", 8, 8, 130, 550, 2025),
    ("Arc B570", "Intel Arc B570", 10, 8, 150, 500, 2025),
    ("RTX 3060 12GB", "GeForce RTX 3060 12GB", 12, 16, 170, 550, 2021),
    ("RX 6650 XT", "Radeon RX 6650 XT", 8, 8, 180, 500, 2022),
    ("RX 6600 XT", "Radeon RX 6600 XT", 8, 8, 160, 500, 2021),
    ("RX 6600", "Radeon RX 6600", 8, 8, 132, 450, 2021),
    ("RTX 3050 8GB", "GeForce RTX 3050", 8, 8, 130, 550, 2022),
]
# Card đời cũ không có trong bảng 2026: tên, sức mạnh ước tính (3060 = 1), RT ước tính / None, VRAM, làn, W, nguồn, năm
GPU_OLD = [
    ("RTX 2080 Ti", 1.40, 1.15, 11, 16, 250, 650, 2018),
    ("RTX 2080 Super", 1.22, 1.00, 8, 16, 250, 650, 2019),
    ("RTX 2080", 1.15, 0.95, 8, 16, 215, 650, 2018),
    ("RTX 2070 Super", 1.08, 0.90, 8, 16, 215, 650, 2019),
    ("RTX 2070", 0.97, 0.80, 8, 16, 175, 550, 2018),
    ("RTX 2060 Super", 0.93, 0.78, 8, 16, 175, 550, 2019),
    ("RTX 2060 12GB", 0.88, 0.80, 12, 16, 184, 500, 2021),
    ("RTX 3060 8GB", 0.85, 0.85, 8, 16, 170, 550, 2022),
    ("RTX 3050 6GB", 0.72, 0.65, 6, 8, 70, 300, 2024),
    ("RX 7900 GRE", 1.92, 1.40, 16, 16, 260, 700, 2024),
    ("RX 6800", 1.48, 0.95, 16, 16, 250, 650, 2020),
    ("RX 5700 XT", 0.97, None, 8, 16, 225, 600, 2019),
    ("RX 5700", 0.88, None, 8, 16, 180, 550, 2019),
    ("RX 5600 XT", 0.80, None, 6, 16, 150, 450, 2020),
    ("Arc A770", 1.03, 1.00, 16, 16, 225, 650, 2022),
    ("Arc A750", 0.95, 0.92, 8, 16, 225, 600, 2022),
    ("GTX 1080 Ti", 1.00, None, 11, 16, 250, 600, 2017),
    ("GTX 1080", 0.80, None, 8, 16, 180, 500, 2016),
    ("GTX 1070 Ti", 0.75, None, 8, 16, 180, 500, 2017),
    ("GTX 1070", 0.68, None, 8, 16, 150, 500, 2016),
    ("RTX 2060", 0.85, 0.80, 6, 16, 160, 500, 2019),
    ("GTX 1660 Super", 0.72, None, 6, 16, 125, 450, 2019),
    ("GTX 1660 Ti", 0.71, None, 6, 16, 120, 450, 2019),
    ("GTX 1660", 0.63, None, 6, 16, 120, 450, 2019),
    ("RX 6500 XT", 0.58, 0.40, 4, 4, 107, 400, 2022),
    ("GTX 1060 6GB", 0.55, None, 6, 16, 120, 400, 2016),
    ("GTX 1650 Super", 0.58, None, 4, 16, 100, 350, 2019),
    ("RX 590", 0.60, None, 8, 16, 225, 500, 2018),
    ("RX 580 8GB", 0.56, None, 8, 16, 185, 500, 2017),
    ("RX 5500 XT", 0.57, None, 8, 8, 130, 400, 2019),
    ("GTX 1060 3GB", 0.50, None, 3, 16, 120, 400, 2016),
    ("RX 580 2048SP", 0.48, None, 8, 16, 150, 450, 2018),
    ("RX 570", 0.48, None, 4, 16, 150, 450, 2017),
    ("GTX 970", 0.47, None, 4, 16, 145, 500, 2014),
    ("Arc A380", 0.40, 0.35, 6, 8, 75, 300, 2022),
    ("RX 6400", 0.40, 0.25, 4, 4, 53, 300, 2022),
    ("GTX 1650", 0.47, None, 4, 16, 75, 300, 2019),
    ("GTX 1050 Ti", 0.38, None, 4, 16, 75, 300, 2016),
    ("GTX 1050", 0.30, None, 2, 16, 75, 300, 2016),
    ("GTX 1630", 0.28, None, 4, 16, 75, 300, 2022),
    ("Đồ họa tích hợp (iGPU)", 0.12, None, 1, 16, 0, 300, None),
]


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


blender = json.load(open(ROOT / "data/blender-render-4.5.json", encoding="utf-8"))["rows"]


def _bkey(name):
    """Tên so khớp với dữ liệu Blender: bỏ đuôi "Six-Core", "w/ 780M", "GPU", "(16GB)", "Graphics", tiền tố Radeon"""
    n = re.sub(r"\s+(w/.*|\w+-Core)$", "", name)
    n = re.sub(r"\s*\(\d+GB\)$", "", n)
    n = re.sub(r"\s+(GPU|Graphics)$", "", n)
    n = re.sub(r"^Radeon\s+", "", n)
    return norm(n)


def blender_points(kind, name):
    key = _bkey(re.sub(r" (6|8|10|12|16)GB$", "", name))
    for r in blender:
        if r["kind"] == kind and _bkey(r["name"]) == key:
            return r["points"]
    return None


toms = json.load(open(ROOT / "data/toms-gpu-hierarchy-2026.json", encoding="utf-8"))
fps = lambda s: float(re.search(r"\(([\d.]+)\)", s).group(1))
raster = {r[0]: [fps(c) for c in r[2:5]] for r in toms["raster"][1:]}
rt = {r[0]: [fps(c) for c in r[2:5]] for r in toms["rt"][1:]}

# Hiệu chỉnh bằng số đo thật (pcdex-scan "Đo hiệu năng", đã xác minh): Quản trị → Số đo → "Tải JSON hiệu chỉnh",
# lưu vào data/bench-calibration.json. Chỉ thay điểm render đang là ước tính, khi có ≥ CALIB_MIN người đo khác nhau.
CALIB_MIN = 5
_calib_path = ROOT / "data/bench-calibration.json"
calib = {}
if _calib_path.exists():
    for c in json.load(open(_calib_path, encoding="utf-8"))["parts"]:
        if c["users"] >= CALIB_MIN:
            calib[(c["kind"], c["name"])] = round(c["medianPoints"])


cpus = []
for n, sock, gm_t, st_t, gm_e, st_e, w, y in CPU:
    bp = blender_points("cpu", n)
    st = round(st_t / ST_REF * 10000) if st_t else st_e * 100
    cpus.append(dict(
        n=n, s=sock, w=w, y=y,
        gm=round(gm_t / GM_REF * 10000) if gm_t else gm_e * 100,
        st=st,
        mt=bp or calib.get(("cpu", n)) or round(st * 0.75),  # chưa có Blender: số đo người dùng, hoặc ước tính thô từ đơn nhân
        src={"gm": "toms" if gm_t else "est", "st": "toms" if st_t else "est",
             "mt": "blender" if bp else "measured" if ("cpu", n) in calib else "est"}))

for n, gm_e, st_e, w, y in CPU_LAPTOP:
    bp = blender_points("cpu", n)
    st = st_e * 100
    cpus.append(dict(n=n, s="BGA", w=w, y=y, gm=gm_e * 100, st=st, m=True,
                     mt=bp or calib.get(("cpu", n)) or round(st * 0.75),
                     src={"gm": "est", "st": "est", "mt": "blender" if bp else "measured" if ("cpu", n) in calib else "est"}))

gpus = []
for n, t, v, lanes, tbp, rec, y in GPU:
    f1080, f1440, f2160 = raster[t]
    gpus.append(dict(n=n, f=[round(max(f1080, f1440 / R1440), 1), f1440, f2160], r=round(f1440 / REF_1440 * 10000),
                     rt=round(rt[t][1] / REF_RT1440 * 10000), rd=blender_points("gpu", n), v=v, lanes=lanes,
                     tbp=tbp, rec=rec, y=y, src="toms", rsrc="blender"))
base = [61.5, 41.9, 22.2]  # RTX 3060 12GB


def render_est(name, rel):
    """Card chưa có trong dữ liệu Blender (OptiX / HIP / oneAPI): ước tính render theo sức mạnh game và hãng.
    RTX có OptiX render mạnh hơn game; GTX chỉ có CUDA, AMD Polaris không có HIP trên Blender 4.x → yếu hơn nhiều (scoring-spec mục 2)."""
    if name.startswith("Đồ họa tích hợp"):
        return 300
    k = 1.15 if name.startswith("RTX") else 0.45 if name.startswith("GTX") else 0.8 if name.startswith("Arc") \
        else 0.3 if re.match(r"RX (4|5)\d0\b", name) else 0.6
    return round(rel * 10000 * k)
for n, rel, rtrel, v, lanes, tbp, rec, y in GPU_OLD:
    vf = [1, 0.85 if v <= 6 else 1, 0.6 if v <= 6 else 1]
    gpus.append(dict(n=n, f=[round(b * rel * k, 1) for b, k in zip(base, vf)], r=round(rel * 10000),
                     rt=None if rtrel is None else round(rtrel * 10000),
                     rd=blender_points("gpu", n) or calib.get(("gpu", n)) or render_est(n, rel), v=v,
                     lanes=lanes, tbp=tbp, rec=rec, y=y, src="est",
                     rsrc="blender" if blender_points("gpu", n) else "measured" if ("gpu", n) in calib else "est"))

for n, rel, rtrel, v, tmin, tmax, tdef, y in GPU_LAPTOP:
    vf = [1, 0.85 if v <= 6 else 1, 0.6 if v <= 6 else 1]
    bp = blender_points("gpu", n)
    # trung vị Blender của card laptop đã ngang bản máy bàn (đa số máy đo chạy TGP cao) → coi như ở TGP phổ biến, không quy đổi thêm
    gpus.append(dict(n=n, f=[round(b * rel * k, 1) for b, k in zip(base, vf)], r=round(rel * 10000),
                     rt=None if rtrel is None else round(rtrel * 10000),
                     rd=bp or calib.get(("gpu", n)) or render_est(n, rel), v=v, lanes=16, tbp=tmax or 100, rec=0, y=y,
                     src="est", rsrc="blender" if bp else "measured" if ("gpu", n) in calib else "est", m=True,
                     tgp=None if tmax is None else {"min": tmin, "max": tmax, "default": tdef}))
for n, rel, y in IGPU:
    bp = blender_points("gpu", n)
    gpus.append(dict(n=n, f=[round(b * rel * k, 1) for b, k in zip(base, [1, 0.85, 0.6])], r=round(rel * 10000), rt=None,
                     rd=bp or calib.get(("gpu", n)) or round(rel * 10000 * 0.5), v=2, lanes=16, tbp=0, rec=0, y=y,
                     src="est", rsrc="blender" if bp else "measured" if ("gpu", n) in calib else "est", ig=True))

missing_cpu = [c["n"] for c in cpus if c["mt"] is None]
missing_gpu = [g["n"] for g in gpus if g["rd"] is None]
out = ROOT / "prototype/parts.js"
with open(out, "w", encoding="utf-8") as f:
    f.write("// Sinh tự động bởi tools/build_parts.py — không sửa tay.\n")
    f.write("window.PARTS = " + json.dumps({"cpus": cpus, "gpus": gpus}, ensure_ascii=False, indent=0) + ";\n")
print(f"{len(cpus)} CPU, {len(gpus)} GPU → {out}")

# Bản cho packages/shared: tên trường dễ đọc
shared = {
    "scaleVersion": "0.5",
    "cpus": [dict(name=c["n"], socket=c["s"], powerW=c["w"], releaseYear=c["y"], gaming=c["gm"], single=c["st"],
                  render=c["mt"], source=c["src"], mobile=bool(c.get("m"))) for c in cpus],
    "gpus": [dict(name=g["n"], fps={"1080": g["f"][0], "1440": g["f"][1], "2160": g["f"][2]}, raster=g["r"],
                  rayTracing=g["rt"], render=g["rd"], renderSource=g["rsrc"], vramGb=g["v"], pcieLanes=g["lanes"], boardPowerW=g["tbp"],
                  psuRecommendedW=g["rec"], releaseYear=g["y"], integrated=bool(g.get("ig")) or g["n"].startswith("Đồ họa tích hợp"),
                  source=g["src"], mobile=bool(g.get("m")), tgp=g.get("tgp")) for g in gpus],
}
out2 = ROOT / "packages/shared/src/data/parts.json"
out2.parent.mkdir(parents=True, exist_ok=True)
with open(out2, "w", encoding="utf-8") as f:
    json.dump(shared, f, ensure_ascii=False, indent=1)
print(f"→ {out2}")
print("CPU thiếu điểm Blender:", missing_cpu)
print("GPU thiếu điểm Blender:", missing_gpu)
