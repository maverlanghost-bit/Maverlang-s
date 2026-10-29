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
} from "@/lib/trade/real-guards";

export const runtime = "nodejs";

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
): Promise<number> {
  const services = getServices();
  try {
    const quote = await services.trade.quote({ ...body, symbol: body.symbol });
    return quote.side === "buy" ? quote.inAmountUi : quote.outAmountUi;
  } catch {
    // Sin precio no se puede valorar: la venta o el quote en acciones/CLP
    // sigue su curso y los límites se aplican de nuevo en build/submit con
    // el notional guardado.
    return 0;
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
    if (session) {
      const userLimited =
        (await withRateLimit(req, "trade", [session.userId])) ??
        (isUserDemoRequest(req) ? await withRateLimit(req, "demoTrade", [session.userId]) : null);
      if (userLimited) return userLimited;
    }
    const body = await parseJson(req, tradeQuoteRequestSchema);
    const symbol = await requireSymbolForBuyGuard(body.symbol, body.side);
    if (isRealAccountRequest(req)) {
      // El camino real se apaga (503 REAL_DISABLED) hasta que
      // REAL_TRADING_READY=true. Cotizar no mueve dinero, pero se mantiene
      // coherente con build/submit: apagado hasta encender el flag.
      assertRealTradingEnabled();
      // M74: kill switch → beta → límites (por orden, día, mes y global).
      // El notional del quote en dólares sale del motor live; con la cuenta
      // demo el flujo demo no pasa por acá.
      const userId = session?.userId ?? (await requireSession(services, req)).userId;
      const amountUsd =
        body.side === "buy" && body.amountCurrency === "USDC"
          ? body.amount
          : await realQuoteAmountUsd(body);
      await assertRealTradeAllowed(userId, amountUsd);
    }
    if (isUserDemoRequest(req)) {
      const userId = session?.userId ?? (await requireSession(services, req)).userId;
      const data = await callService(req, () => demoSupabase.trade.quote(userId, { ...body, symbol }));
      assertLiveBuyCost(body.side, data.priceDeviationBps);
      return readOutput(tradeQuoteSchema, data);
    }
    const data = await callService(req, () => services.trade.quote({ ...body, symbol }));
    assertLiveBuyCost(body.side, data.priceDeviationBps);
    return readOutput(tradeQuoteSchema, data);
  });
}
