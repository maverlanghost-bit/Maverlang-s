import { assetStatusBatchQuerySchema, assetStatusBatchResponseSchema } from "@/lib/api/contracts";
import { callService, handle, parseQuery, readOutput } from "@/lib/api/handler";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Estado por lote para la cartera: UNA petición agrupa todos los símbolos que
 * antes pedían una request cada uno.
 *
 * - Allowlist: el contrato aplica el mismo `CATALOG_SYMBOL` que
 *   `/api/market/status` y `/api/prices`, con tope de 50 y deduplicado. No se
 *   exige visibilidad: la cartera necesita el estado de activos `hidden` para
 *   mostrar el aviso de sólo-venta.
 * - Auth: dato público, sin sesión y `no-store`, igual que el estado
 *   individual que ya usa el detalle; no se agrega ni se relaja auth.
 * - Fallas parciales: `services.market.statuses` aísla cada símbolo
 *   (`status: null`) y el resto del lote responde igual.
 * - Estados reales: delega en `status()`, la misma fuente live → catálogo →
 *   mock, sin inventar estados a partir de `enabled` del catálogo.
 */
export function GET(req: Request) {
  return handle("no-store", async () => {
    const { symbols } = parseQuery(req, assetStatusBatchQuerySchema);
    const services = getServices();
    const data = await callService(req, () => services.market.statuses(symbols));
    return readOutput(assetStatusBatchResponseSchema, { statuses: data });
  });
}
