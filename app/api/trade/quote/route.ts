import { tradeQuoteRequestSchema, tradeQuoteSchema } from "@/lib/api/contracts";
import {
  parseJson,
  assertSameOrigin,
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
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { demoSupabase } from "@/lib/services/demo.supabase";

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

export function POST(req: Request) {
  return handle("no-store", async () => {
    assertSameOrigin(req);
    const ipLimited = await withRateLimit(req, "tradeIp");
    if (ipLimited) return ipLimited;
    const services = getServices();
    await requireSupabaseUser(services, req);
    const body = await parseJson(req, tradeQuoteRequestSchema);
    const symbol = await requireSymbolForBuyGuard(body.symbol, body.side);
    if (isRealAccountRequest(req)) {
      throw new DomainError("VALIDATION", "La cuenta real todavía no opera.");
    }
    if (isUserDemoRequest(req)) {
      const session = await requireSession(services, req);
      const userLimited =
        (await withRateLimit(req, "trade", [session.userId])) ??
        (await withRateLimit(req, "demoTrade", [session.userId]));
      if (userLimited) return userLimited;
      const data = await callService(req, () => demoSupabase.trade.quote(session.userId, { ...body, symbol }));
      assertLiveBuyCost(body.side, data.priceDeviationBps);
      return readOutput(tradeQuoteSchema, data);
    }
    const data = await callService(req, () => services.trade.quote({ ...body, symbol }));
    assertLiveBuyCost(body.side, data.priceDeviationBps);
    return readOutput(tradeQuoteSchema, data);
  });
}
