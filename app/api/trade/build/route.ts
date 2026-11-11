import { tradeBuildRequestSchema, tradeBuildResponseSchema } from "@/lib/api/contracts";
import {
  parseJson,
  assertSameOrigin,
  assertRealTradingEnabled,
  callService,
  handle,
  readOutput,
  requireSession,
  requireSupabaseUser,
  isRealAccountRequest,
  isUserDemoRequest,
} from "@/lib/api/handler";
import { apiOperateBlock } from "@/lib/compliance/real-quote";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { demoSupabase } from "@/lib/services/demo.supabase";
import { createTradeQuoteStore } from "@/lib/services/trade-quotes.supabase";
import { assertCryptoDemoOnly } from "@/lib/trade/crypto-real-block";
import {
  assertLiveEngineAccess,
  assertRealTradeAllowed,
  assertRealTradeReservation,
  assertRealTradingDataMode,
  rekeyRealTradeReservation,
} from "@/lib/trade/real-guards";
import type { TradeBuildRequest, TradeBuildResponse } from "@/lib/types";

export const runtime = "nodejs";

/** El servicio live acepta el dueño de la cotización como segundo argumento. */
type OwnerScopedBuild = (request: TradeBuildRequest, userId?: string) => Promise<TradeBuildResponse>;

export function POST(req: Request) {
  return handle("no-store", async () => {
    const geo = apiOperateBlock(req);
    if (geo) return geo;
    assertSameOrigin(req);
    const ipLimited = await withRateLimit(req, "tradeIp");
    if (ipLimited) return ipLimited;
    const services = getServices();
    const session = await requireSupabaseUser(services, req);
    let userId = session?.userId ?? null;
    const realAccount = isRealAccountRequest(req);
    const demoAccount = isUserDemoRequest(req);
    // Auditoría 2026-11: con DATA_MODE=live, sin sesión Supabase verificada
    // ni cuenta real explícita no se llega al motor live (flags, beta y
    // límites sólo existen en la rama real). La demo de Supabase sigue igual.
    assertLiveEngineAccess(realAccount, demoAccount);
    if (session) {
      const userLimited =
        (await withRateLimit(req, "trade", [session.userId])) ??
        (demoAccount ? await withRateLimit(req, "demoTrade", [session.userId]) : null);
      if (userLimited) return userLimited;
    }
    const body = await parseJson(req, tradeBuildRequestSchema);
    let realOwnerId: string | null = null;
    if (realAccount) {
      // M46: el camino real se apaga (503 REAL_DISABLED) hasta que
      // REAL_TRADING_READY=true. Con el flag encendido, pasa al motor live
      // de abajo. El camino demo sigue igual.
      assertRealTradingEnabled();
      assertRealTradingDataMode();
      // M74: kill switch → beta → límites. La carrera de dos builds
      // simultáneos se corta acá: cada build re-comprueba los topes antes
      // de armar la tx y submit vuelve a comprobarlos al firmar.
      realOwnerId = userId ?? (await requireSession(services, req)).userId;
      userId = realOwnerId;
      // Criptos y staking sólo en la demo (decisión §1.1): el símbolo vive en
      // la cotización real guardada para este `quoteId`. Si es cripto/LST/USDY
      // se corta ANTES de tocar límites y de pedirle la transacción a
      // Jupiter. Si la cotización no se puede leer, no se arma nada de todos
      // modos: la guardia de reserva de abajo falla cerrada.
      const storedQuote = await createTradeQuoteStore()
        .readQuote(realOwnerId, body.quoteId)
        .catch(() => null);
      assertCryptoDemoOnly(storedQuote?.payload.symbol ?? "", realAccount);
      await assertRealTradeAllowed(realOwnerId, null);
      // La reserva creada al cotizar debe seguir activa. Se valida ANTES de
      // pedirle la transacción a Jupiter: una reserva vencida no arma nada.
      await assertRealTradeReservation(realOwnerId, body.quoteId);
    }
    if (demoAccount) {
      const demoUserId = session?.userId ?? (await requireSession(services, req)).userId;
      const data = await callService(req, () => demoSupabase.trade.build(demoUserId, body));
      return readOutput(tradeBuildResponseSchema, data);
    }
    // El dueño de la cotización viaja al motor: un quoteId ajeno → NOT_FOUND.
    const build = services.trade.build as OwnerScopedBuild;
    const data = await callService(req, () => build(body, userId ?? undefined));
    if (realAccount && realOwnerId && data.requestId !== body.quoteId) {
      // Jupiter puede cambiar el requestId al armar la transacción. La
      // reserva se re-etiqueta; submit exige la reserva con el id final.
      await rekeyRealTradeReservation(realOwnerId, body.quoteId, data.requestId);
    }
    return readOutput(tradeBuildResponseSchema, data);
  });
}
