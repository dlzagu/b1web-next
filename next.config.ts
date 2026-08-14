import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 는 네이티브 모듈 — 번들링 제외하고 native require 사용
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
