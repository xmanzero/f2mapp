import type { MetadataRoute } from "next";

/** Cài lên màn hình điện thoại (PWA): tên, màu navy, icon symbol P */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "pcdex", short_name: "pcdex",
    description: "Chấm điểm sức mạnh PC, bảng xếp hạng và chợ linh kiện cũ. PC power score, leaderboard and used-parts market.",
    start_url: "/may", display: "standalone", background_color: "#080f24", theme_color: "#080f24",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/apple-icon.png", type: "image/png", sizes: "180x180" },
      { src: "/brand/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
  };
}
