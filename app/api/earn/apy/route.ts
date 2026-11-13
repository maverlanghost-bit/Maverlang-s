import { NextResponse } from "next/server";

import type { LstApyResult, LstApySource } from "@/lib/market/lst-apy";
import { fetchLstApys, LST_APY_SYMBOLS } from "@/lib/market/lst-apy";
import { withRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * APY de Ganar (MODO DEMO): los 6 LST + USDY. Público, sin datos de usuario.
 * `apy` va en PORCENTAJE (4.85 = 4,85 %) o `null` cuando la fuente no tiene
 * dato: nunca 0 como si fuera un APY válido. JupSOL, INF, dSOL y USDY no
 * tienen endpoint oficial sin clave, así que quedan en "sin dato".
 * El cache en memoria de `fetchLstApys` es de 10 min; el CDN, más corto.
 */
const APY_CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

interface EarnApyItem {
  symbol: string;
  apy: number | null;
  asOf: string | null;
  source: LstApySource;
}

export async function GET(req: Request) {
  const limited = await withRateLimit(req, "publicGet");
  if (limited) return limited;

  let apys: Record<string, LstApyResult> = {};
  try {
    apys = await fetchLstApys();
  } catch {
    // Si algo inesperado falla, la UI muestra "sin dato"; no se inventa un APY.
    apys = {};
  }

  const items: EarnApyItem[] = LST_APY_SYMBOLS.map(({ symbol }) => {
    const reading = apys[symbol];
    return {
      symbol,
      apy: reading ? reading.apyPercent : null,
      asOf: reading ? reading.asOf : null,
      source: reading ? reading.source : "none",
    };
  });
  // USDY se ofrece en Ganar como opción de dólares, sin APY público sin clave.
  items.push({ symbol: "USDY", apy: null, asOf: null, source: "none" });

  return NextResponse.json(
    { items },
    {
      status: 200,
      headers: {
        "cache-control": APY_CACHE,
        "x-content-type-options": "nosniff",
      },
    },
  );
}
