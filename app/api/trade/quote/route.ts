import { tradeQuoteRequestSchema, tradeQuoteSchema } from "@/lib/api/contracts";
import {
  parseJson,
  assertSameOrigin,
  assertRealTradingEnabled,
  callService,
  handle,
  readOutput,
  requireSession,
  requireSupabaseUser,
  requireSymbolForSide,
  isRealAccountRequest,
  isUserDemoRequest,
} from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { findAssetBySymbol } from "@/lib/catalog/assets";
import { SAFETY_THRESHOLDS } from "@/lib/catalog/safety-core.mjs";
import { apiOperateBlock } from "@/lib/compliance/real-quote";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { demoSupabase } from "@/lib/services/demo.supabase";
import {
  assertRealTradeAllowed,
  assertRealTradingDataMode,
  assertLiveEngineAccess,
  releaseRealTradeReservations,
} from "@/lib/trade/real-guards";
import { assertQuoteIntegrity } from "@/lib/trade/integrity";
import type { TradeQuote, TradeQuoteRequest } from "@/lib/types";

export const runtime = "nodejs";

/**
 * El servicio live acepta el dueño de la cotización como segundo argumento y,
 * para valoraciones internas, `{ persist: false }` como tercero.
 */
type OwnerScopedQuote = (
  request: TradeQuoteRequest,
  userId?: string,
  options?: { persist?: boolean },
) => Promise<TradeQuote>;

/**
 * Guardia en vivo al cotizar (M55, demo hoy y real en M70): la COMPRA de un
 * activo conocido pero no operable (watch/hidden) responde ASSET_UNAVAILABLE
 * ("en revisión"). Lo desconocido sigue MINT_NOT_ALLOWED y la venta sigue la
 * regla de M54c (vender siempre lo que se tiene).
 */
async function requireSymbolForBuyGuard(symbol: string, side: "buy" | "sell"): Promise<string> {
  try {
    return await requireSymbolForSide(symbol, side);
  } catch (error) {
    if (side === "buy" && error instanceof DomainError && error.code === "MINT_NOT_ALLOWED") {
      const known = await findAssetBySymbol(symbol, {
        scope: "all",
        allowHidden: true,
        noListing: true,
      }).catch(() => null);
      if (known) throw new DomainError("ASSET_UNAVAILABLE");
    }
    throw error;
  }
}

/**
 * Rechaza la compra si la cotización real se despega sobre los umbrales
 * (M70; en demo la desviación es de juguete y nunca salta).
 */
function assertLiveBuyCost(side: "buy" | "sell", priceDeviationBps: number): void {
  if (side === "buy" && priceDeviationBps > SAFETY_THRESHOLDS.maxDeviationBps) {
    throw new DomainError("ASSET_UNAVAILABLE");
  }
}

/**
 * Notional en dólares de un quote real cuyo monto no viene en USDC
 * (acciones o CLP, o venta): lo cotiza el motor live y se toma el lado
 * en dólares del resultado. Sólo se llama en la cuenta real.
 */
async function realQuoteAmountUsd(
  body: { side: "buy" | "sell"; symbol: string; amount: number; amountCurrency: "USDC" | "SHARES" | "CLP" },
  userId: string,
): Promise<number> {
  const services = getServices();
  try {
    const quote = services.trade.quote as OwnerScopedQuote;
    // Valoración interna: NO reserva cupo ni guarda la cotización (nadie la va
    // a armar). El resultado sólo sirve para calcular el notional de los topes.
    const valued = await quote({ ...body, symbol: body.symbol }, userId, { persist: false });
    return valued.side === "buy" ? valued.inAmountUi : valued.outAmountUi;
  } catch (error) {
    // Sin precio no hay notional: NO se asume 0 (eso saltaría los topes).
    // La operación se rechaza y los límites se vuelven a comprobar en
    // build/submit con el notional guardado en la orden.
    if (error instanceof DomainError) throw error;
    throw new DomainError(
      "UPSTREAM",
      "No pudimos valorar la operación. Intenta de nuevo en un momento.",
    );
  }
}

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
    // Auditoría 2026-11: con DATA_MODE=live, un request sin sesión Supabase
    // verificada y cuenta real explícita no llega al motor live (ni siquiera
    // a validar el símbolo). La demo de Supabase sigue su propio camino.
    assertLiveEngineAccess(realAccount, demoAccount);
    if (session) {
      const userLimited =
        (await withRateLimit(req, "trade", [session.userId])) ??
        (demoAccount ? await withRateLimit(req, "demoTrade", [session.userId]) : null);
      if (userLimited) return userLimited;
    }
    const body = await parseJson(req, tradeQuoteRequestSchema);
    const symbol = await requireSymbolForBuyGuard(body.symbol, body.side);
    let realOwnerId: string | null = null;
    if (realAccount) {
      // El camino real se apaga (503 REAL_DISABLED) hasta que
      // REAL_TRADING_READY=true. Cotizar no mueve dinero, pero se mantiene
      // coherente con build/submit: apagado hasta encender el flag.
      assertRealTradingEnabled();
      assertRealTradingDataMode();
      // M74: kill switch → beta → límites (por orden, día, mes y global).
      // El notional del quote en dólares sale del motor live; con la cuenta
      // demo el flujo demo no pasa por acá.
      realOwnerId = userId ?? (await requireSession(services, req)).userId;
      userId = realOwnerId;
      // D-06: la cotización nueva reemplaza la anterior. Se liberan las
      // reservas especulativas previas ANTES de comprobar los topes: si no,
      // `checkLimits` contaba dos veces la misma intención de operar y el
      // usuario se bloqueaba solo al ajustar el monto.
      await releaseRealTradeReservations(realOwnerId);
      const amountUsd =
        body.side === "buy" && body.amountCurrency === "USDC"
          ? body.amount
          : await realQuoteAmountUsd(body, realOwnerId);
      await assertRealTradeAllowed(realOwnerId, amountUsd);
    }
    if (demoAccount) {
      const demoUserId = session?.userId ?? (await requireSession(services, req)).userId;
      const data = await callService(req, () => demoSupabase.trade.quote(demoUserId, { ...body, symbol }));
      assertLiveBuyCost(body.side, data.priceDeviationBps);
      return readOutput(tradeQuoteSchema, data);
    }
    // La cotización live queda ligada al usuario de la sesión (cuando hay):
    // build/submit rechazan un quoteId de otra cuenta.
    const quote = services.trade.quote as OwnerScopedQuote;
    const data = await callService(req, () => quote({ ...body, symbol }, userId ?? undefined));
    assertLiveBuyCost(body.side, data.priceDeviationBps);
    if (realAccount && realOwnerId) {
      // Integridad de la cotización. El cupo y la cotización quedan guardados
      // por el motor live en la MISMA fila de `trade_reservations` (ola 6):
      // build/submit la leen de ahí desde cualquier instancia y validan la
      // reserva. Todo esto sigue detrás de REAL_EXECUTION_LOCKED.
      assertQuoteIntegrity({
        inAmountUi: data.inAmountUi,
        outAmountUi: data.outAmountUi,
        pricePerShareUsd: data.pricePerShareUsd,
        expiresAt: data.expiresAt,
        platformFeeUsd: data.costs.platformFeeUsd,
      });
    }
    return readOutput(tradeQuoteSchema, data);
  });
}
