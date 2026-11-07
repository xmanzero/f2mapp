"""Tính điểm render từ Blender Open Data (CC0), quy về mốc 12400F / RTX 3060 = 10.000.

Cách làm giống trang Blender Open Data: điểm thiết bị = tổng trung vị samples_per_minute
của 3 cảnh (monster, junkshop, classroom). Chỉ lấy lượt chạy 1 thiết bị, 1 phiên bản Blender.
"""
import collections, json, re, statistics, sys, zipfile

ZIP, VERSION, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
GPU_API = {"OPTIX", "HIP", "ONEAPI"}  # NVIDIA dùng OptiX, AMD dùng HIP, Intel dùng oneAPI


def clean(name: str) -> str:
    n = re.sub(r"\((R|TM|tm|r)\)", "", name)
    n = re.sub(r"\s+@.*$", "", n)
    n = re.sub(r"\b(\d+-Core Processor|Processor|CPU|Graphics|with Radeon.*)$", "", n.strip())
    n = re.sub(r"^(\d+th Gen )?Intel\s*", "", n)
    n = re.sub(r"^(AMD|NVIDIA)\s+", "", n)
    n = n.replace("GeForce ", "").replace("Radeon ", "")
    return re.sub(r"\s+", " ", n).strip()


spm = collections.defaultdict(lambda: collections.defaultdict(list))  # (kind, name) -> scene -> [spm]
z = zipfile.ZipFile(ZIP)
with z.open(next(n for n in z.namelist() if n.endswith(".jsonl"))) as f:
    for line in f:
        d = json.loads(line)
        if d.get("schema_version") != "v4":
            continue
        for r in d["data"]:
            if not r.get("blender_version", {}).get("version", "").startswith(VERSION):
                continue
            di = r.get("device_info", {})
            dt = di.get("device_type")
            names = {c["name"] for c in di.get("compute_devices", [])}
            if len(names) != 1 or "samples_per_minute" not in r.get("stats", {}):
                continue
            if dt == "CPU":
                if r.get("system_info", {}).get("num_cpu_sockets", 1) != 1:
                    continue
                kind = "cpu"
            elif dt in GPU_API and len(di["compute_devices"]) == 1:
                kind = "gpu"
            else:
                continue
            spm[(kind, clean(names.pop()))][r["scene"]["label"]].append(r["stats"]["samples_per_minute"])

rows = []
for (kind, name), scenes in spm.items():
    if len(scenes) < 3:
        continue
    n = min(len(v) for v in scenes.values())
    if n < 5:
        continue
    rows.append({"kind": kind, "name": name, "n": n,
                 "score": sum(statistics.median(v) for v in scenes.values())})

ref = {"cpu": next(r["score"] for r in rows if r["name"] == "Core i5-12400F"),
       "gpu": next(r["score"] for r in rows if r["name"] == "RTX 3060")}
for r in rows:
    r["points"] = round(r["score"] / ref[r["kind"]] * 10000)
rows.sort(key=lambda r: (r["kind"], -r["points"]))
json.dump({"source": "Blender Open Data (CC0)", "blender": VERSION, "rows": rows},
          open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{sum(r['kind']=='cpu' for r in rows)} CPU, {sum(r['kind']=='gpu' for r in rows)} GPU")
