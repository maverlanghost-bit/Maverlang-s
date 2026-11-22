import { orderSchema, tradeStatusQuerySchema } from "@/lib/api/contracts";
import {
  assertRealTradingEnabled,
  callService,
  handle,
  parseQuery,
  readOutput,
} from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { serverEnv } from "@/lib/env";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { assertRealExecutionLocked, assertRealWithdrawalsEnabled } from "@/lib/trade/real-guards";
import { getWithdrawalStatus } from "@/lib/wallet/withdrawal-store";
import { requireWalletSession } from "@/lib/wallet/live-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Estado de una salida de dinero (T42). El `id` es la reserva creada en
 * build/submit, no el pedido del cliente: la lectura se resuelve en el store
 * de salidas con el `userId` de la sesión.
 */
export function GET(req: Request) {
  return handle("no-store", async () => {
    const ipLimited = await withRateLimit(req, "tradeIp");
    if (ipLimited) return ipLimited;
    const { id } = parseQuery(req, tradeStatusQuerySchema);
    // M46: dinero real apagado responde 503 sin tocar servicios. Va después de
    // validar la query para no gastar el cupo por IP en un pedido mal formado.
    assertRealTradingEnabled();
    // Auditoría D-01: el candado de ejecución real va ANTES de cualquier
    // lectura del libro de salidas. Con `REAL_EXECUTION_LOCKED=true` la ruta
    // responde 503 REAL_DISABLED aunque `REAL_TRADING_READY=true`, así que
    // ningún estado de salida —ni siquiera el de la propia cuenta— se sirve
    // mientras la compuerta siga cerrada.
    assertRealExecutionLocked();
    const services = getServices();
    // En supabase exige usuario verificado; en mock devuelve null y la salida
    // se lee del servicio demo de siempre.
    const session = await requireWalletSession(services, req);
    const userLimited = session
      ? await withRateLimit(req, "trade", [session.userId])
      : await withRateLimit(req, "trade");
    if (userLimited) return userLimited;
    // D-01: mismo kill switch de salidas que build/submit. Apagado en el panel
    // → 503 REAL_DISABLED antes de leer nada, coherente con la pantalla Enviar.
    await assertRealWithdrawalsEnabled();
    if (session) {
      // La lectura exige dueño: el `userId` sale de la sesión y el store filtra
      // por él, así que un id ajeno → NOT_FOUND sin filtrar datos ni revelar
      // que la salida existe.
      const data = await getWithdrawalStatus({ userId: session.userId, id });
      return readOutput(orderSchema, data);
    }
    // MON-8: con DATA_MODE=live `requireWalletSession` ya exigió sesión, así que
    // acá sólo se llega en mock. Si alguna vez llegara sin sesión en live,
    // falla cerrado en vez de leer una orden ajena con el cliente admin.
    if (serverEnv.DATA_MODE === "live") throw new DomainError("UNAUTHORIZED");
    const data = await callService(req, () => services.trade.status(id));
    return readOutput(orderSchema, data);
  });
}
