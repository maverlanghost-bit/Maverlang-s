import type { NextConfig } from "next";

import { buildApiHeaders, buildStaticHeaders } from "./lib/security/headers";

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
      // Cubre páginas, estáticos y también `/api/*` (Next aplica todas las
      // reglas que hacen match y la última gana por cabecera).
      { source: "/(.*)", headers: pageHeaders },
      // B-01: la API se declara aparte para que CORP/nosniff no dependan del
      // matcher del middleware ni de la regla general.
      { source: "/api/:path*", headers: buildApiHeaders() },
    ];
  },
};

export default nextConfig;
