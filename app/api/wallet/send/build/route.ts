import { USDC_MINT } from "@/config/tickers";
import { sendBuildRequestSchema, tradeBuildResponseSchema } from "@/lib/api/contracts";
import { parseJson, assertSameOrigin, assertRealTradingEnabled, callService, handle, readOutput, requireMint, requireSupabaseUser } from "@/lib/api/handler";
import { DomainError, type ApiErrorCode } from "@/lib/api/result";
import { apiOperateBlock } from "@/lib/compliance/real-quote";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices, type Services } from "@/lib/services";
import { livePrices } from "@/lib/services/prices.live";
import { tickerByMint } from "@/lib/solana/allowlist";
import { assertRealExecutionLocked, assertRealWithdrawalsEnabled } from "@/lib/trade/real-guards";
import { requireSessionWalletMatch } from "@/lib/wallet/identity";
import {
  assertSendWithinOperationLimit,
  sendNotionalUsd,
  validateAndPrepareWithdrawal,
  type WithdrawalErrorCode,
} from "@/lib/wallet/withdrawals";

export const runtime = "nodejs";

/**
 * T35: los códigos de `validateAndPrepareWithdrawal` que el contrato de la API
 * no conoce (`SELF_TRANSFER_NOT_ALLOWED`, `ASSET_NOT_ALLOWED`) se traducen al
 * código existente más cercano para no romper el esquema del cliente. El
 * mensaje del rechazo viaja tal cual lo escribió la validación.
 */
const WITHDRAWAL_API_CODE: Record<WithdrawalErrorCode, ApiErrorCode> = {
  REAL_DISABLED: "REAL_DISABLED",
  VALIDATION: "VALIDATION",
  SELF_TRANSFER_NOT_ALLOWED: "VALIDATION",
  ASSET_NOT_ALLOWED: "MINT_NOT_ALLOWED",
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
};

/**
 * Saldo disponible del activo en la billetera de origen (unidades UI).
 * Sin fila para ese mint el saldo es 0 (no existe el activo en la cuenta).
 * Una lectura caída devuelve `NaN`, que `validateAndPrepareWithdrawal` rechaza
 * como saldo ilegible: nunca se interpreta como "sin tope".
 */
async function availableBalanceUi(services: Services, address: string, mint: string): Promise<number> {
  try {
    const balances = await services.portfolio.balances(address);
    const row = balances.find((item) => item.mint === mint);
    return row ? row.uiAmount : 0;
  } catch {
    return Number.NaN;
  }
}

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
    // T35: la salida pasa por `validateAndPrepareWithdrawal` ANTES de armar
    // nada: billetera de la sesión, monto y destino. Un rechazo responde el
    // error y no se llama a `sendBuild`. T41: si el cliente manda `requestId`,
    // la referencia del movimiento se deriva de esa clave (determinista), así
    // que un reintento no abre una segunda salida en el libro.
    const preparation = validateAndPrepareWithdrawal({
      destinationAddress: body.to,
      sourceAddress: userPublicKey,
      mint,
      amountUi: body.amountUi,
      availableBalanceUi: await availableBalanceUi(services, userPublicKey, mint),
      ...(session ? { sessionWalletAddress: session.walletAddress } : {}),
      ...(body.requestId ? { requestId: body.requestId } : {}),
    });
    if (!preparation.ok) {
      throw new DomainError(WITHDRAWAL_API_CODE[preparation.code], preparation.message);
    }
    // D-01: tope por operación, valorado en dólares. Sin precio legible la
    // salida se rechaza (no hay notional que comparar contra el tope).
    // T42: el mismo notional viaja al servicio para que la reserva del libro
    // (`wallet_withdrawals`) cuente dólares y no unidades del activo.
    const notionalUsd = isValuableMint(mint)
      ? sendNotionalUsd({ mint, amountUi: body.amountUi, priceUsd: await sendPriceUsd(mint) })
      : null;
    if (isValuableMint(mint)) {
      assertSendWithinOperationLimit(notionalUsd);
    }
    const data = await callService(req, () =>
      services.portfolio.sendBuild({
        ...body,
        mint,
        userPublicKey,
        // T41: la referencia viaja al servicio para que el débito se registre
        // con una sola clave por operación (UNIQUE en `wallet_movements`).
        reference: preparation.preparation.reference,
        // T42: el dueño del libro de retiros es la sesión verificada, nunca el
        // cuerpo del request (en mock no hay sesión y no se reserva nada).
        ...(session ? { userId: session.userId } : {}),
        ...(notionalUsd !== null ? { notionalUsd } : {}),
      }),
    );
    return readOutput(tradeBuildResponseSchema, data);
  });
}
