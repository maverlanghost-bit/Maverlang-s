import "server-only";

import { Connection, PublicKey, VersionedTransaction, TransactionMessage } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import type {
  Activity,
  Balance,
  Position,
  Portfolio,
  SendBuildRequest,
  TradeBuildResponse,
} from "@/lib/types";
import { getServerConnection } from "@/lib/solana/connection";
import { classifyMint, tickerByMint } from "@/lib/solana/allowlist";
import { fetchMintMultiplier, rawToShares, sharesToRaw } from "@/lib/solana/scaled-ui";
import { USDC_MINT } from "@/config/tickers";
import { livePrices } from "@/lib/services/prices.live";
import { isValidSolanaAddress } from "@/lib/solana/address";
import { DomainError } from "@/lib/api/result";
import { listOrdersForActivity } from "@/lib/services/orders.supabase";
import { insertCryptoDeposit, listDepositSignatures } from "@/lib/services/deposits.supabase";

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
   * Historial real: las órdenes (compra/venta) del usuario desde `orders`.
   * Recibe `address` (para futuras firmas on-chain de send/receive) y
   * `userId` (las órdenes se guardan por usuario). Sin órdenes → lista vacía.
   */
  async activity(input: { address: string; userId: string }): Promise<Activity[]> {
    if (!isValidSolanaAddress(input.address)) {
      throw new DomainError("VALIDATION", "La direccion de la billetera no es valida.");
    }
    const rows = await listOrdersForActivity(input.userId);
    return rows.map((row) => ({
      id: row.id,
      kind: row.side as Activity["kind"],
      symbol: row.symbol,
      amountUi: Number(row.in_amount_ui ?? 0),
      valueUsd: Number(row.out_amount_ui ?? 0) || null,
      status: row.status,
      signature: row.signature,
      at: row.created_at,
    }));
  },

  /**
   * Arma un envío de tokens (transferencia SPL/Token-2022) sin firmar.
   * Valida origen/destino/mint, calcula el crudo con el multiplicador
   * Token-2022, arma el ATA destino idempotente y la transferencia, y
   * devuelve la transacción en base64. La firma y el envío van en submit.
   */
  async sendBuild(request: SendBuildRequest): Promise<TradeBuildResponse> {
    const to = request.to?.trim() ?? "";
    const from = request.userPublicKey?.trim() ?? "";
    if (!isValidSolanaAddress(to)) {
      throw new DomainError("VALIDATION", "La direccion de destino no es valida.");
    }
    if (!isValidSolanaAddress(from)) {
      throw new DomainError("VALIDATION", "Falta la billetera de origen.");
    }
    if (to === from) {
      throw new DomainError("VALIDATION", "El destino no puede ser la misma billetera.");
    }
    if (!(request.amountUi > 0) || !Number.isFinite(request.amountUi)) {
      throw new DomainError("VALIDATION", "El monto tiene que ser mayor que cero.");
    }
    const kind = classifyMint(request.mint);
    if (kind === "unknown" || kind === "sol" || kind === "disabled") {
      throw new DomainError("MINT_NOT_ALLOWED");
    }

    const connection = getServerConnection();
    const owner = new PublicKey(from);
    const decimals = kind === "usdc" ? USDC_DECIMALS : STOCK_DECIMALS;
    const multiplier = kind === "stock" ? await fetchMintMultiplier(connection, request.mint) : 1;
    const rawAmount = kind === "usdc"
      ? BigInt(Math.round(request.amountUi * 10 ** USDC_DECIMALS))
      : sharesToRaw(request.amountUi, decimals, multiplier);

    // Verificamos saldo leyendo el ATA de origen.
    const source = getAssociatedTokenAddressSync(new PublicKey(request.mint), owner, false);
    const sourceAccount = await connection.getTokenAccountBalance(source).catch(() => null);
    const balance = sourceAccount ? BigInt(sourceAccount.value.amount) : BigInt(0);
    if (balance < rawAmount) {
      throw new DomainError("INSUFFICIENT_FUNDS");
    }

    // Armamos la transferencia (ATA destino idempotente + transferencia).
    const destination = getAssociatedTokenAddressSync(new PublicKey(request.mint), new PublicKey(to), true);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const transaction = new VersionedTransaction(
      new TransactionMessage({
        payerKey: owner,
        recentBlockhash: blockhash,
        instructions: [
          createAssociatedTokenAccountIdempotentInstruction(owner, destination, new PublicKey(to), new PublicKey(request.mint)),
          createTransferInstruction(source, destination, owner, rawAmount),
        ],
      }).compileToV0Message(),
    );
    void lastValidBlockHeight;

    return {
      requestId: `send:${request.mint}:${rawAmount.toString()}:${Date.now()}`,
      transactionBase64: Buffer.from(transaction.serialize()).toString("base64"),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  },

  /**
   * Detecta depósitos de cripto (USDC u otro mint conocido) que entraron a la
   * billetera y los registra en `crypto_deposits`. Compara los balances de
   * token antes/después de cada firma reciente: si el ATA del usuario subió,
   * es un depósito. Idempotente por firma (no cuenta dos veces).
   * Devuelve los depósitos nuevos encontrados en esta pasada.
   */
  async detectDeposits(input: { address: string; userId: string }): Promise<{ mint: string; amountUi: number; signature: string }[]> {
    if (!isValidSolanaAddress(input.address)) {
      throw new DomainError("VALIDATION", "La direccion de la billetera no es valida.");
    }
    const connection = getServerConnection();
    const owner = new PublicKey(input.address);
    const alreadySeen = await listDepositSignatures(input.userId);

    // Firmas recientes de la billetera (lote acotado para no barrer historia).
    const signatures = await connection.getSignaturesForAddress(owner, { limit: 25 });
    const fresh = signatures.filter((sig) => !alreadySeen.has(sig.signature));
    if (fresh.length === 0) return [];

    const parsed = await connection.getParsedTransactions(
      fresh.map((sig) => sig.signature),
      { maxSupportedTransactionVersion: 0 },
    );

    const found: { mint: string; amountUi: number; signature: string; from: string | null }[] = [];
    for (const tx of parsed) {
      if (!tx || !tx.meta || tx.meta.err) continue;
      const pre = tx.meta.preTokenBalances ?? [];
      const post = tx.meta.postTokenBalances ?? [];
      for (const after of post) {
        if (after.owner !== input.address) continue;
        const before = pre.find((b) => b.accountIndex === after.accountIndex && b.mint === after.mint);
        const delta = (after.uiTokenAmount.uiAmount ?? 0) - (before?.uiTokenAmount.uiAmount ?? 0);
        if (delta <= 0) continue;
        const kind = classifyMint(after.mint);
        if (kind !== "usdc" && kind !== "stock") continue;
        found.push({
          mint: after.mint,
          amountUi: delta,
          signature: tx.transaction.signatures[0] ?? "",
          from: null,
        });
      }
    }

    const registrados: { mint: string; amountUi: number; signature: string }[] = [];
    for (const dep of found) {
      if (!dep.signature) continue;
      const ok = await insertCryptoDeposit({
        userId: input.userId,
        mint: dep.mint,
        amountUi: dep.amountUi,
        signature: dep.signature,
        fromAddress: dep.from,
      });
      if (ok) registrados.push({ mint: dep.mint, amountUi: dep.amountUi, signature: dep.signature });
    }
    return registrados;
  },
};
