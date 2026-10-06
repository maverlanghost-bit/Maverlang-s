import { isLowLiquidity, searchCatalog } from "@/lib/catalog/assets";
import { marketSearchQuerySchema, marketSearchResponseSchema } from "@/lib/api/contracts";
import { handle, queryOf, readOutput } from "@/lib/api/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Búsqueda del mercado (M38). Filtra por texto (símbolo, subyacente, nombre,
 * sin acentos), categoría y alcance; pagina en el servidor. `logoUrl` es la
 * ruta local o null (monograma, sin hotlinking). Cache corto de 30/60 s.
 */
export function GET(req: Request) {
  return handle("short", async () => {
    const params = queryOf(marketSearchQuerySchema, req);
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
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      hasMore: result.hasMore,
    });
  });
}
