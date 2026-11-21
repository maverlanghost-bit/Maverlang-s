import "server-only";

import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { tickerBySymbol, USDC_MINT } from "@/config/tickers";
import { DomainError } from "@/lib/api/result";
import type { StockLimitPreview, StockLimitPreviewRequest } from "@/lib/api/stock-limit-contracts";
import { getServerConnection, publicCluster } from "@/lib/solana/connection";
import { getEffectiveMultiplier } from "@/lib/solana/scaled-ui";
import { TOKEN_2022_PROGRAM_ID } from "@/lib/solana/token-instructions";
import { stockLimitTerms } from "@/lib/trade/stock-limit-terms";

// xStocks recomienda pausar alrededor de la activación de un multiplicador.
const MULTIPLIER_PAUSE_SECONDS = 15 * 60;
const rpcNumber = z.union([z.number(), z.string().trim().min(1)]).transform(Number);
const multiplier = rpcNumber.pipe(z.number().positive());
const unix = rpcNumber.pipe(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER));
const scaleSchema = z.object({
  multiplier,
  newMultiplier: multiplier,
  newMultiplierEffectiveTimestamp: unix,
});
const inactiveTransferHook = z.object({ programId: z.null() });
const pausableConfig = z.object({ paused: z.boolean() });
const mintSchema = z.object({
  parsed: z.object({
    type: z.literal("mint"),
    info: z.object({
      decimals: z.number().int().min(0).max(18),
      extensions: z.array(z.object({ extension: z.string(), state: z.unknown().optional() })),
    }),
  }),
});

async function readStockMint(mint: string) {
  const connection = getServerConnection();
  try {
    const account = await connection.getParsedAccountInfo(new PublicKey(mint), "confirmed");
    const observedAtUnix = account.value ? await connection.getBlockTime(account.context.slot) : null;
    return { account, observedAtUnix };
  } catch {
    throw new DomainError("UPSTREAM", "No pudimos leer el activo en Solana.");
  }
}

async function preview(request: StockLimitPreviewRequest): Promise<StockLimitPreview> {
  const ticker = tickerBySymbol(request.symbol);
  if (!ticker?.enabled) throw new DomainError("MINT_NOT_ALLOWED");
  if (publicCluster() !== "mainnet-beta") throw new DomainError("REAL_DISABLED");

  const { account, observedAtUnix } = await readStockMint(ticker.mint);
  const mint = mintSchema.safeParse(account.value?.data);
  if (!account.value?.owner.equals(TOKEN_2022_PROGRAM_ID) || !mint.success ||
      !observedAtUnix || !Number.isSafeInteger(observedAtUnix) || observedAtUnix < 0) {
    throw new DomainError("UPSTREAM", "No pudimos verificar los datos del activo en Solana.");
  }
  const { decimals, extensions } = mint.data.parsed.info;
  if (decimals !== ticker.decimals) {
    throw new DomainError("UPSTREAM", "La precisión del activo no coincide con el catálogo.");
  }
  if (extensions.some(({ extension, state }) =>
    extension === "transferFeeConfig" ||
    extension === "interestBearingConfig" ||
    (extension === "transferHook" && !inactiveTransferHook.safeParse(state).success),
  )) {
    throw new DomainError("ASSET_UNAVAILABLE", "El activo tiene extensiones incompatibles con este cálculo.");
  }
  const pause = extensions.find(({ extension }) => extension === "pausableConfig");
  if (pause) {
    const config = pausableConfig.safeParse(pause.state);
    if (!config.success) throw new DomainError("UPSTREAM", "No pudimos verificar si el activo está pausado.");
    if (config.data.paused) throw new DomainError("ASSET_UNAVAILABLE", "El activo está pausado en Solana.");
  }
  const scaled = extensions.filter(({ extension }) => extension === "scaledUiAmountConfig");
  const config = scaleSchema.safeParse(scaled[0]?.state);
  if (scaled.length !== 1 || !config.success) {
    throw new DomainError("UPSTREAM", "No pudimos verificar el multiplicador del activo.");
  }
  const { newMultiplierEffectiveTimestamp } = config.data;
  const changesMultiplier = config.data.multiplier !== config.data.newMultiplier;
  if (changesMultiplier && Math.abs(newMultiplierEffectiveTimestamp - observedAtUnix) <= MULTIPLIER_PAUSE_SECONDS) {
    throw new DomainError("ASSET_UNAVAILABLE", "El multiplicador del activo se está actualizando. Intenta más tarde.");
  }
  const effective = getEffectiveMultiplier(config.data, observedAtUnix);
  const terms = stockLimitTerms({ ...request, stockDecimals: decimals, multiplier: effective });
  const buy = request.side === "buy";
  return {
    symbol: ticker.symbol,
    side: request.side,
    limitPriceUsdc: request.limitPriceUsdc,
    inputMint: buy ? USDC_MINT : ticker.mint,
    outputMint: buy ? ticker.mint : USDC_MINT,
    ...terms,
    stockDecimals: decimals,
    multiplier: effective,
    observedSlot: account.context.slot,
    observedAtUnix,
    nextMultiplierAtUnix: changesMultiplier && newMultiplierEffectiveTimestamp > observedAtUnix
      ? newMultiplierEffectiveTimestamp
      : null,
  };
}

export const liveStockLimits = { preview };
