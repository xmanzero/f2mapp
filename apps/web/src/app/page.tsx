// Trang tạm để kiểm tra web dùng được @f2m/shared. Giao diện thật làm ở bước thiết kế (ui-ux-pro-max + taste-skill).
import { ANCHOR_CPU, ANCHOR_GPU, evaluate, resolveMachine, SCALE_VERSION } from "@f2m/shared";

export default function Home() {
  const r = evaluate(
    resolveMachine({ cpu: ANCHOR_CPU, gpu: ANCHOR_GPU, ramGb: 16, ramChannels: 2, storage: "nvme3", pcieGen: 4, psuW: 550, resolution: 1080 }),
    2026, // trang tĩnh không được đọc đồng hồ (cacheComponents); trang thật tính năm theo request
  );
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">f2m · khung dự án</h1>
      <p className="mt-2 text-sm opacity-70">Thang điểm v{SCALE_VERSION}. Máy mốc: {ANCHOR_CPU} + {ANCHOR_GPU}.</p>
      <p className="mt-4 text-4xl font-bold tabular-nums">{Math.round(r.scores.power).toLocaleString("vi-VN")}</p>
      <p>Hạng {r.tier.name}</p>
      <ul className="mt-4 list-disc pl-5">
        {r.needs.map((n) => (
          <li key={n.need}>
            {n.label}: {n.levelLabel} · {n.detail}
          </li>
        ))}
      </ul>
    </main>
  );
}
