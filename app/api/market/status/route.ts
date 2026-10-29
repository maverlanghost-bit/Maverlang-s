import { assetStatusSchema, marketStatusQuerySchema, marketStatusSchema } from "@/lib/api/contracts";
import { callService, handle, parseQuery, readOutput } from "@/lib/api/handler";
import { status as assetStatus } from "@/lib/market/asset-status";
import { mockMarketStatus } from "@/lib/mocks/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Estado del mercado (M39). Sin `symbol`, el estado general (compatibilidad
 * con la llamada actual). Con `?symbol=AAPLx`, el horario real de la acción
 * (live → catálogo → mock).
 */
export function GET(req: Request) {
  return handle("no-store", async () => {
    const params = parseQuery(req, marketStatusQuerySchema);
    if (params.symbol) {
      const data = await callService(req, () => assetStatus(params.symbol as string));
      return readOutput(assetStatusSchema, data);
    }
    // Horario local de Nueva York, lun–vie 09:30–16:00. Sin red y sin NOT_IMPLEMENTED.
    return readOutput(marketStatusSchema, mockMarketStatus());
  });
}
