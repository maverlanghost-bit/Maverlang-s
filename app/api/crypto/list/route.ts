import { NextResponse } from "next/server";

import { CRYPTO_ASSETS } from "@/lib/catalog/crypto";
import { withRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lista pública del catálogo cripto (29 tokens, MODO DEMO). Sin datos de
 * usuario y sin precios: sólo identidad, sello, origen, grupo y tope por
 * orden. El catálogo cambia con el código, no con la sesión, así que el CDN
 * puede servirlo unos minutos.
 */
const LIST_CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=300";

export async function GET(req: Request) {
  const limited = await withRateLimit(req, "publicGet");
  if (limited) return limited;

  const items = CRYPTO_ASSETS.map((asset) => ({
    symbol: asset.symbol,
    name: asset.name,
    mint: asset.mint,
    decimals: asset.decimals,
    seal: asset.seal,
    group: asset.group,
    originLabel: asset.originLabel,
    maxOrderUsd: asset.maxOrderUsd,
  }));

  return NextResponse.json(
    { items },
    {
      status: 200,
      headers: {
        "cache-control": LIST_CACHE,
        "x-content-type-options": "nosniff",
      },
    },
  );
}
