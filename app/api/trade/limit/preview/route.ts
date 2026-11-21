import {
  assertRealTradingEnabled,
  assertSameOrigin,
  callService,
  handle,
  isRealAccountRequest,
  parseJson,
  readOutput,
  requireSession,
  requireSymbolForSide,
  requireWallet,
} from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { stockLimitPreviewRequestSchema, stockLimitPreviewSchema } from "@/lib/api/stock-limit-contracts";
import { apiOperateBlock } from "@/lib/compliance/real-quote";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import {
  assertRealExecutionLocked,
  assertRealTradeAllowed,
  assertRealTradingDataMode,
} from "@/lib/trade/real-guards";

export const runtime = "nodejs";

export function POST(req: Request) {
  return handle("no-store", async () => {
    const geo = apiOperateBlock(req);
    if (geo) return geo;
    assertSameOrigin(req);
    if (!isRealAccountRequest(req)) throw new DomainError("REAL_DISABLED");
    assertRealTradingEnabled();
    assertRealTradingDataMode();
    assertRealExecutionLocked();

    const ipLimited = await withRateLimit(req, "tradeIp");
    if (ipLimited) return ipLimited;
    const services = getServices();
    const session = await requireSession(services, req);
    requireWallet(session);
    const userLimited = await withRateLimit(req, "trade", [session.userId]);
    if (userLimited) return userLimited;

    const body = await parseJson(req, stockLimitPreviewRequestSchema);
    await assertRealTradeAllowed(session.userId, null);
    const symbol = await requireSymbolForSide(body.symbol, body.side);
    const stockLimits = services.stockLimits;
    if (!stockLimits) throw new DomainError("REAL_DISABLED");

    // Vista previa de cantidades. La ruta no cotiza ni reserva saldo.
    const data = await callService(req, () => stockLimits.preview({ ...body, symbol }));
    return readOutput(stockLimitPreviewSchema, data);
  });
}
