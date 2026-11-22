import { tradeSubmitRequestSchema, tradeSubmitResponseSchema } from "@/lib/api/contracts";
import {
  parseJson,
  assertSameOrigin,
  assertRealTradingEnabled,
  callService,
  handle,
  readOutput,
  requireSession,
  isRealAccountRequest,
  isUserDemoRequest,
} from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { apiOperateBlock } from "@/lib/compliance/real-quote";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { demoSupabase } from "@/lib/services/demo.supabase";
import { createTradeQuoteStore } from "@/lib/services/trade-quotes.supabase";
import { assertCryptoDemoOnly } from "@/lib/trade/crypto-real-block";
import {
  assertLiveEngineAccess,
  assertRealSubmitReservation,
  assertRealTradeAllowed,
  assertRealTradingDataMode,
} from "@/lib/trade/real-guards";

export const runtime = "nodejs";

export function POST(req: Request) {
  return handle("no-store", async () => {
    const geo = apiOperateBlock(req);
    if (geo) return geo;
    assertSameOrigin(req);
    const ipLimited = await withRateLimit(req, "tradeIp");
    if (ipLimited) return ipLimited;
    const services = getServices();
    const session = await requireSession(services, req);
    const realAccount = isRealAccountRequest(req);
    const demoAccount = isUserDemoRequest(req);
    // Auditoría 2026-11: con DATA_MODE=live, sin sesión Supabase verificada
    // ni cuenta real explícita no se firma ni se envía nada al motor live.
    assertLiveEngineAccess(realAccount, demoAccount);
    const userLimited = await withRateLimit(req, "trade", [session.userId]);
    if (userLimited) return userLimited;
    const body = await parseJson(req, tradeSubmitRequestSchema);
    // MON-1: los retiros (`send:...`) sólo se transmiten por
    // `/api/wallet/send/submit`, que valida el interruptor de retiros. Por acá
    // se rechazan siempre (antes saltaban `assertRealWithdrawalsEnabled`).
    if (body.requestId.startsWith("send:")) {
      throw new DomainError(
        "VALIDATION",
        "Los envíos se confirman desde la pantalla Enviar, no por este camino.",
      );
    }
    if (realAccount) {
      // M46: el camino real se apaga (503 REAL_DISABLED) hasta que
      // REAL_TRADING_READY=true. Con el flag encendido, pasa al motor live.
      assertRealTradingEnabled();
      assertRealTradingDataMode();
      // M74: kill switch → beta → límites. Una orden ya `built` sin firmar
      // se rechaza ACÁ si `trading_enabled` se apagó entre el build y el
      // submit (el req. del traspaso: "la orden built se rechaza al submit").
      await assertRealTradeAllowed(session.userId, null);
      // Reserva atómica: se consume antes de enviar. Un reintento con la
      // reserva ya consumida es idempotente (el request_id único de orders
      // impide ejecutar dos veces); una reserva liberada/vencida corta acá.
      // Los `send:...` ya se rechazaron arriba (MON-1): acá sólo hay trades.
      {
        // Criptos y staking sólo en la demo (decisión §1.1): el símbolo se
        // reconoce por la cotización real guardada para este `requestId`. Va
        // ANTES de consumir la reserva: una operación rechazada por política
        // no debe gastar cupo del usuario.
        const storedQuote = await createTradeQuoteStore()
          .readQuote(session.userId, body.requestId)
          .catch(() => null);
        assertCryptoDemoOnly(storedQuote?.payload.symbol ?? "", realAccount);
        await assertRealSubmitReservation(session.userId, body.requestId);
      }
    }
    if (demoAccount) {
      const demoLimited = await withRateLimit(req, "demoTrade", [session.userId]);
      if (demoLimited) return demoLimited;
      const data = await callService(req, () => demoSupabase.trade.submit(session.userId, body));
      return readOutput(tradeSubmitResponseSchema, data);
    }
    const data = await callService(req, () => services.trade.submit(body, session.userId));
    return readOutput(tradeSubmitResponseSchema, data);
  });
}
