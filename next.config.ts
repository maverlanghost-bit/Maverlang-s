import type { NextConfig } from "next";

import { buildStaticHeaders } from "./lib/security/headers";

const distDir = process.env.NEXT_DIST_DIR?.trim();
const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  ...(distDir ? { distDir } : {}),
  poweredByHeader: false,
  async headers() {
    const pageHeaders = buildStaticHeaders({ isProd }).map(({ key, value }) => ({ key, value }));
    return [
      { source: "/(.*)", headers: pageHeaders },
      {
        source: "/api/:path*",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }],
      },
    ];
  },
};

export default nextConfig;
