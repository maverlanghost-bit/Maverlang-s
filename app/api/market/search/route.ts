import { isLowLiquidity, searchCatalog } from "@/lib/catalog/assets";
import { marketSearchQuerySchema, marketSearchResponseSchema } from "@/lib/api/contracts";
import { handle, parseQuery, readOutput } from "@/lib/api/handler";
import { withRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Búsqueda del mercado (M38). Filtra por texto (símbolo, subyacente, nombre,
 * sin acentos), categoría y alcance; pagina en el servidor. `logoUrl` es la
 * ruta local o null (monograma, sin hotlinking). Cache corto de 30/60 s.
 */
export function GET(req: Request) {
  return handle("short", async () => {
    const ipLimited = await withRateLimit(req, "search");
    if (ipLimited) return ipLimited;
    const params = parseQuery(req, marketSearchQuerySchema);
    const result = await searchCatalog({
      q: params.q,
      category: params.category,
      scope: params.scope,
      page: params.page,
      pageSize: params.pageSize,
      sort: params.sort,
    });
    return readOutput(marketSearchResponseSchema, {
      items: result.items.map((asset) => ({
        symbol: asset.symbol,
        name: asset.name,
        underlying: asset.underlying,
        category: asset.category,
        mint: asset.mint,
        logoUrl: asset.logoLocal,
        enabled: asset.enabled,
        halted: asset.halted,
        liquidityUsd: asset.liquidityUsd,
        lowLiquidity: isLowLiquidity(asset),
        curated: asset.curated,
        openNow: asset.openNow,
        period: asset.period,
        mode: asset.mode,
        nextChangeAt: asset.nextChangeAt,
        tradable: asset.tradable,
        underReview: asset.underReview,
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      hasMore: result.hasMore,
    });
  });
}
