import type { NextConfig } from "next";

import { buildStaticHeaders } from "./lib/security/headers";

const distDir = process.env.NEXT_DIST_DIR?.trim();
const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  ...(distDir ? { distDir } : {}),
  poweredByHeader: false,
  // Los `sizes` reales son 40, 64 y 96. Sin 3840 el srcset no ofrece esa variante.
  images: {
    deviceSizes: [640, 828, 1080, 1200],
    imageSizes: [40, 48, 64, 96, 128],
  },
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
