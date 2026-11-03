import { USDC_MINT } from "@/config/tickers";
import { sendBuildRequestSchema, tradeBuildResponseSchema } from "@/lib/api/contracts";
import { parseJson, assertSameOrigin, assertRealTradingEnabled, callService, handle, readOutput, requireMint, requireSupabaseUser } from "@/lib/api/handler";
import { apiOperateBlock } from "@/lib/compliance/real-quote";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { livePrices } from "@/lib/services/prices.live";
import { tickerByMint } from "@/lib/solana/allowlist";
import { assertRealExecutionLocked, assertRealWithdrawalsEnabled } from "@/lib/trade/real-guards";
import { requireSessionWalletMatch } from "@/lib/wallet/identity";
import { assertSendWithinOperationLimit, sendNotionalUsd } from "@/lib/wallet/withdrawals";

export const runtime = "nodejs";

/** Mints que se pueden valorar para el tope de salida (USDC o acción activa). */
function isValuableMint(mint: string): boolean {
  return mint === USDC_MINT || tickerByMint(mint)?.enabled === true;
}

/**
 * Precio en dólares para valorar la salida. USDC es 1:1; una acción usa el
 * precio vivo. Sin precio legible → `null` y el tope rechaza (no se asume 0).
 */
async function sendPriceUsd(mint: string): Promise<number | null> {
  if (mint === USDC_MINT) return 1;
  const ticker = tickerByMint(mint);
  if (!ticker?.enabled) return null;
  try {
    const quotes = await livePrices.list([ticker.symbol]);
    return quotes[0]?.priceUsd ?? null;
  } catch {
    return null;
  }
}

export function POST(req: Request) {
  return handle("no-store", async () => {
    const geo = apiOperateBlock(req);
    if (geo) return geo;
    assertSameOrigin(req);
    // M46: dinero real apagado (503 REAL_DISABLED sin tocar servicios).
    // La validación de dirección de la pantalla Enviar es del cliente y sigue igual.
    assertRealTradingEnabled();
    // Auditoría D-01: la salida de fondos pasa por el MISMO candado de código
    // que quote/build/submit. Con `REAL_EXECUTION_LOCKED=true` responde 503
    // REAL_DISABLED aunque `REAL_TRADING_READY=true` y `DATA_MODE=live`: el
    // operador no puede creer que el candado sigue cerrado mientras la única
    // puerta de salida ya está armable.
    assertRealExecutionLocked();
    const ipLimited = await withRateLimit(req, "tradeIp");
    if (ipLimited) return ipLimited;
    const services = getServices();
    const session = await requireSupabaseUser(services, req);
    const userLimited = session
      ? await withRateLimit(req, "trade", [session.userId])
      : await withRateLimit(req, "trade");
    if (userLimited) return userLimited;
    // D-01: kill switch de salidas, la misma clave `withdrawals_enabled` que
    // muestra el panel en "Salida de dinero" (D-18). Apagado → 503
    // REAL_DISABLED antes de armar cualquier transacción.
    await assertRealWithdrawalsEnabled();
    const body = await parseJson(req, sendBuildRequestSchema);
    const mint = requireMint(body.mint);
    // Con identidad Supabase, la billetera de origen tiene que ser la
    // verificada en la sesión. No se acepta una dirección arbitraria del
    // cuerpo. En mock no hay sesión y sigue el flujo demo de siempre.
    const userPublicKey = session
      ? requireSessionWalletMatch(session.walletAddress, body.userPublicKey)
      : body.userPublicKey;
    // D-01: tope por operación, valorado en dólares. Sin precio legible la
    // salida se rechaza (no hay notional que comparar contra el tope).
    if (isValuableMint(mint)) {
      assertSendWithinOperationLimit(
        sendNotionalUsd({ mint, amountUi: body.amountUi, priceUsd: await sendPriceUsd(mint) }),
      );
    }
    const data = await callService(req, () =>
      services.portfolio.sendBuild({ ...body, mint, userPublicKey }),
    );
    return readOutput(tradeBuildResponseSchema, data);
  });
}
