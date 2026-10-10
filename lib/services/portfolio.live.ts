import "server-only";

import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";

import type { Activity, Balance, Position, Portfolio, TradeBuildResponse } from "@/lib/types";
import { getServerConnection } from "@/lib/solana/connection";
import { classifyMint, tickerByMint } from "@/lib/solana/allowlist";
import { fetchMintMultiplier, rawToShares } from "@/lib/solana/scaled-ui";
import { USDC_MINT } from "@/config/tickers";
import { livePrices } from "@/lib/services/prices.live";
import { isValidSolanaAddress } from "@/lib/solana/address";
import { DomainError } from "@/lib/api/result";

const USDC_DECIMALS = 6;
const STOCK_DECIMALS = 8;

/** Una cuenta de token encontrada en la billetera, ya normalizada. */
interface TokenHolding {
  mint: string;
  raw: bigint;
  decimals: number;
  multiplier: number;
}

/**
 * Lee todas las cuentas de token (Token clásico + Token-2022) de una billetera
 * y devuelve sólo las de mints conocidos (stock/usdc), con su multiplicador.
 * Ignora mints desconocidos: un mint falso no entra a la cartera.
 */
async function readHoldings(connection: Connection, owner: PublicKey): Promise<TokenHolding[]> {
  const [classic, token2022] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
  ]);

  const holdings: TokenHolding[] = [];
  for (const account of [...classic.value, ...token2022.value]) {
    const info = account.account.data.parsed?.info;
    if (!info) continue;
    const mint = String(info.mint ?? "");
    const raw = BigInt(info.tokenAmount?.amount ?? "0");
    if (raw <= BigInt(0)) continue;
    const kind = classifyMint(mint);
    if (kind !== "stock" && kind !== "usdc") continue;
    const decimals = Number(info.tokenAmount?.decimals ?? (kind === "usdc" ? USDC_DECIMALS : STOCK_DECIMALS));
    const multiplier = kind === "stock" ? await fetchMintMultiplier(connection, mint) : 1;
    holdings.push({ mint, raw, decimals, multiplier });
  }
  return holdings;
}

/** Precio en USD por acción de un mint, o null si no hay. */
async function priceOf(mint: string): Promise<number | null> {
  if (mint === USDC_MINT) return 1;
  const [quote] = await livePrices.list([mint]);
  return quote && quote.priceUsd > 0 ? quote.priceUsd : null;
}

/**
 * Cartera live: lee los tokens de la billetera en la cadena (Token-2022 para
 * acciones, Token clásico para USDC) y los valúa con `prices.live`.
 */
export const livePortfolio = {
  /**
   * Cartera: posiciones (acciones) + saldo USDC, valuada en USD.
   * El costo medio y P&L salen de las órdenes reales del usuario; la cadena
   * no los guarda. Sin órdenes, pnl queda null (no inventado).
   */
  async get(address: string): Promise<Portfolio> {
    if (!isValidSolanaAddress(address)) {
      throw new DomainError("VALIDATION", "La direccion de la billetera no es valida.");
    }
    const connection = getServerConnection();
    const owner = new PublicKey(address);
    const holdings = await readHoldings(connection, owner);

    let cashUsdc = 0;
    const stockHoldings = holdings.filter((holding) => classifyMint(holding.mint) === "stock");

    const positions = [];
    let positionsValue = 0;
    for (const holding of holdings) {
      if (holding.mint === USDC_MINT) {
        cashUsdc = Number(holding.raw) / 10 ** holding.decimals;
      }
    }

    for (const holding of stockHoldings) {
      const shares = rawToShares(holding.raw, holding.decimals, holding.multiplier);
      const price = (await priceOf(holding.mint)) ?? 0;
      const valueUsd = shares * price;
      positionsValue += valueUsd;
      const symbol = tickerByMint(holding.mint)?.symbol;
      if (!symbol) continue;
      positions.push({
        symbol: symbol as Position["symbol"],
        shares,
        multiplier: holding.multiplier,
        avgCostUsd: null,
        priceUsd: price,
        valueUsd,
        pnlUsd: null,
        pnlPct: null,
        allocationPct: 0,
      });
    }

    const totalUsd = cashUsdc + positionsValue;
    // Asignación: peso de cada posición sobre el valor total de posiciones.
    for (const position of positions) {
      position.allocationPct = positionsValue > 0 ? (position.valueUsd / positionsValue) * 100 : 0;
    }

    return {
      address,
      totalUsd,
      cashUsdc,
      positions,
      pnlUsd: null,
      pnlPct: null,
      updatedAt: new Date().toISOString(),
    };
  },

  /**
   * Saldos de la billetera: cada mint conocido (stock/usdc) con su cantidad
   * UI (ya con el multiplicador Token-2022) y su valor en USD.
   */
  async balances(address: string): Promise<Balance[]> {
    if (!isValidSolanaAddress(address)) {
      throw new DomainError("VALIDATION", "La direccion de la billetera no es valida.");
    }
    const connection = getServerConnection();
    const owner = new PublicKey(address);
    const holdings = await readHoldings(connection, owner);

    const balances: Balance[] = [];
    for (const holding of holdings) {
      const kind = classifyMint(holding.mint);
      const uiAmount =
        kind === "usdc"
          ? Number(holding.raw) / 10 ** holding.decimals
          : rawToShares(holding.raw, holding.decimals, holding.multiplier);
      const price = await priceOf(holding.mint);
      const symbol = (kind === "usdc" ? "USDC" : tickerByMint(holding.mint)?.symbol) as Balance["symbol"];
      balances.push({
        mint: holding.mint,
        symbol,
        rawAmount: holding.raw.toString(),
        uiAmount,
        // Precio ausente → 0: el caller lo trata como dato faltante, no como
        // un precio real de cero (el tipo Balance no admite null).
        valueUsd: price === null ? 0 : uiAmount * price,
      });
    }
    return balances;
  },

  /**
   * TODO actividad.
   * Dos fuentes: filas `orders` del usuario (buy/sell) y firmas de la address
   *   (`getSignaturesForAddress`) para send/receive. El proveedor de parseo de esas
   *   firmas está [POR DEFINIR]: no adivinar el tipo de instrucción.
   * Mapeo a Activity: kind, symbol, amountUi (ya con multiplicador), valueUsd, status, signature, at.
   * Errores: address inválida → VALIDATION. Supabase o RPC → UPSTREAM. Sin filas → lista vacía, no un error.
   * Cache: no.
   */
  async activity(): Promise<Activity[]> {
    throw new Error("NOT_IMPLEMENTED: actividad on-chain / orders");
  },

  /**
   * TODO armar un envío.
   * Parámetros: to, mint, amountUi, userPublicKey. `isValidSolanaAddress` en las dos claves.
   *   `classifyMint`: `unknown`, `sol` o `disabled` → MINT_NOT_ALLOWED. `stock` usa Token-2022;
   *   `usdc` usa el programa clásico. amountUi → crudo con `sharesToRaw` (USDC: × 10^6, multiplicador 1).
   * Mapeo a TradeBuildResponse: transacción de transferencia (ATA destino idempotente) en base64,
   *   sin firmar. requestId propio. La firma y el débito ocurren en submit, como en el mock.
   * Errores: destino = origen → VALIDATION. Saldo insuficiente → INSUFFICIENT_FUNDS.
   *   Renta de ATA (~0,0016 SOL) se muestra; no se patrocina (`sponsor.ts`, requiere KMS).
   * Cache: no.
   */
  async sendBuild(): Promise<TradeBuildResponse> {
    throw new Error("NOT_IMPLEMENTED: transferencia SPL Token-2022 o USDC");
  },
};
