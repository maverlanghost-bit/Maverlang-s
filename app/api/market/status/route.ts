import { assetStatusSchema, marketStatusQuerySchema, marketStatusSchema } from "@/lib/api/contracts";
import { callService, handle, queryOf, readOutput } from "@/lib/api/handler";
import { status as assetStatus } from "@/lib/market/asset-status";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Estado del mercado (M39). Sin `symbol`, el estado general (compatibilidad
 * con la llamada actual). Con `?symbol=AAPLx`, el horario real de la acción
 * (live → catálogo → mock).
 */
export function GET(req: Request) {
  return handle("no-store", async () => {
    const params = queryOf(marketStatusQuerySchema, req);
    if (params.symbol) {
      const data = await callService(req, () => assetStatus(params.symbol as string));
      return readOutput(assetStatusSchema, data);
    }
    const services = getServices();
    const data = await callService(req, () => services.prices.market());
    return readOutput(marketStatusSchema, data);
  });
}
