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
]

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
    ("RTX 2060", 0.85, 0.80, 6, 16, 160, 500, 2019),
    ("GTX 1660 Super", 0.72, None, 6, 16, 125, 450, 2019),
    ("RX 6500 XT", 0.58, 0.40, 4, 4, 107, 400, 2022),
    ("GTX 1060 6GB", 0.55, None, 6, 16, 120, 400, 2016),
    ("GTX 1650", 0.47, None, 4, 16, 75, 300, 2019),
    ("GTX 1050 Ti", 0.38, None, 4, 16, 75, 300, 2016),
    ("Đồ họa tích hợp (iGPU)", 0.12, None, 1, 16, 0, 300, None),
]


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


blender = json.load(open(ROOT / "data/blender-render-4.5.json", encoding="utf-8"))["rows"]


def blender_points(kind, name):
    key = norm(re.sub(r" (6|8|10|12|16)GB$", "", name))
    for r in blender:
        if r["kind"] == kind and norm(r["name"]) == key:
            return r["points"]
    return None


toms = json.load(open(ROOT / "data/toms-gpu-hierarchy-2026.json", encoding="utf-8"))
fps = lambda s: float(re.search(r"\(([\d.]+)\)", s).group(1))
raster = {r[0]: [fps(c) for c in r[2:5]] for r in toms["raster"][1:]}
rt = {r[0]: [fps(c) for c in r[2:5]] for r in toms["rt"][1:]}

cpus = []
for n, sock, gm_t, st_t, gm_e, st_e, w, y in CPU:
    bp = blender_points("cpu", n)
    st = round(st_t / ST_REF * 10000) if st_t else st_e * 100
    cpus.append(dict(
        n=n, s=sock, w=w, y=y,
        gm=round(gm_t / GM_REF * 10000) if gm_t else gm_e * 100,
        st=st,
        mt=bp or round(st * 0.75),  # chưa có Blender: ước tính thô từ đơn nhân
        src={"gm": "toms" if gm_t else "est", "st": "toms" if st_t else "est", "mt": "blender" if bp else "est"}))

gpus = []
for n, t, v, lanes, tbp, rec, y in GPU:
    f1080, f1440, f2160 = raster[t]
    gpus.append(dict(n=n, f=[round(max(f1080, f1440 / R1440), 1), f1440, f2160], r=round(f1440 / REF_1440 * 10000),
                     rt=round(rt[t][1] / REF_RT1440 * 10000), rd=blender_points("gpu", n), v=v, lanes=lanes,
                     tbp=tbp, rec=rec, y=y, src="toms"))
base = [61.5, 41.9, 22.2]  # RTX 3060 12GB
for n, rel, rtrel, v, lanes, tbp, rec, y in GPU_OLD:
    vf = [1, 0.85 if v <= 6 else 1, 0.6 if v <= 6 else 1]
    gpus.append(dict(n=n, f=[round(b * rel * k, 1) for b, k in zip(base, vf)], r=round(rel * 10000),
                     rt=None if rtrel is None else round(rtrel * 10000), rd=blender_points("gpu", n) or 300, v=v,
                     lanes=lanes, tbp=tbp, rec=rec, y=y, src="est"))

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
                  render=c["mt"], source=c["src"]) for c in cpus],
    "gpus": [dict(name=g["n"], fps={"1080": g["f"][0], "1440": g["f"][1], "2160": g["f"][2]}, raster=g["r"],
                  rayTracing=g["rt"], render=g["rd"], vramGb=g["v"], pcieLanes=g["lanes"], boardPowerW=g["tbp"],
                  psuRecommendedW=g["rec"], releaseYear=g["y"], integrated=g["n"].startswith("Đồ họa tích hợp"),
                  source=g["src"]) for g in gpus],
}
out2 = ROOT / "packages/shared/src/data/parts.json"
out2.parent.mkdir(parents=True, exist_ok=True)
with open(out2, "w", encoding="utf-8") as f:
    json.dump(shared, f, ensure_ascii=False, indent=1)
print(f"→ {out2}")
print("CPU thiếu điểm Blender:", missing_cpu)
print("GPU thiếu điểm Blender:", missing_gpu)
