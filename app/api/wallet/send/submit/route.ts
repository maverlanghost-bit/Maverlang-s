import { tradeSubmitRequestSchema, tradeSubmitResponseSchema } from "@/lib/api/contracts";
import { parseJson, assertSameOrigin, assertRealTradingEnabled, callService, handle, readOutput, requireSupabaseUser } from "@/lib/api/handler";
import { apiOperateBlock } from "@/lib/compliance/real-quote";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { assertRealExecutionLocked, assertRealWithdrawalsEnabled } from "@/lib/trade/real-guards";
import { submitWithdrawal } from "@/lib/wallet/withdrawal-store";

export const runtime = "nodejs";

export function POST(req: Request) {
  return handle("no-store", async () => {
    // Geobloqueo: la salida de dinero cae en la misma compuerta de operación
    // que el resto de la plataforma, antes de mirar el cuerpo o la sesión.
    const geo = apiOperateBlock(req);
    if (geo) return geo;
    // CSRF barato: un POST que mueve fondos no se acepta desde otro origen.
    assertSameOrigin(req);
    // M46: dinero real apagado (503 REAL_DISABLED sin tocar servicios). El
    // armado del cliente no se afecta: acá recién se firmó y se va a enviar.
    assertRealTradingEnabled();
    // Auditoría D-01: enviar una salida firmada pasa por el MISMO candado de
    // código que quote/build/submit. Con `REAL_EXECUTION_LOCKED=true` responde
    // 503 REAL_DISABLED aunque `REAL_TRADING_READY=true` y `DATA_MODE=live`:
    // que la transacción ya venga firmada no convierte al candado en opcional.
    assertRealExecutionLocked();
    const ipLimited = await withRateLimit(req, "tradeIp");
    if (ipLimited) return ipLimited;
    const services = getServices();
    // En supabase el usuario tiene que estar verificado; en mock no hay sesión
    // (null) y sigue el flujo demo. La sesión se lee antes del límite por
    // usuario para poder contar por `userId` y no sólo por IP.
    const session = await requireSupabaseUser(services, req);
    const userLimited = session
      ? await withRateLimit(req, "trade", [session.userId])
      : await withRateLimit(req, "trade");
    if (userLimited) return userLimited;
    // D-01: kill switch de salidas, la misma clave `withdrawals_enabled` que
    // muestra el panel en "Salida de dinero" (D-18). Apagado → 503
    // REAL_DISABLED antes de gastar la firma que trae el cliente.
    await assertRealWithdrawalsEnabled();
    const body = await parseJson(req, tradeSubmitRequestSchema);
    // Libro de retiros idempotente: con sesión Supabase el envío se resuelve
    // contra la reserva guardada por `requestId`, así un reintento del mismo
    // cuerpo no manda la transacción dos veces ni abre una segunda salida. En
    // mock no hay libro ni usuario real: el motor en memoria hace de libro.
    const data = session
      ? await submitWithdrawal({
          userId: session.userId,
          requestId: body.requestId,
          signedTransactionBase64: body.signedTransactionBase64,
        })
      : await callService(req, () => services.trade.submit(body, "mock-user"));
    return readOutput(tradeSubmitResponseSchema, data);
  });
}
