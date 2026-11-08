import type { NextConfig } from "next";

// API (Fastify). Web chuyển tiếp /api/* sang đó để cookie đăng nhập cùng nguồn với web.
// Docker: http://api:8140 (đặt lúc build, xem deploy/Dockerfile.web). Máy dev: http://localhost:8140.
const API_URL = process.env.API_URL ?? "http://localhost:8140";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
  cacheComponents: true,
  // layout gốc nằm trong [lang]: địa chỉ không khớp trang nào dùng app/global-not-found.tsx (hai ngôn ngữ)
  experimental: { globalNotFound: true },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
