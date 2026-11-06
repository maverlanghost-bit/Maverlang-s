import "server-only";

import { Connection, PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@/lib/solana/token-instructions";
import { buildSendTransaction } from "@/lib/solana/send-build";

import type {
  Activity,
  Balance,
  Position,
  Portfolio,
  SendBuildRequest,
  TradeBuildResponse,
} from "@/lib/types";
import { getServerConnection } from "@/lib/solana/connection";
import { classifyMint, NATIVE_SOL_MINT, tickerByMint } from "@/lib/solana/allowlist";
import { fetchMintMultiplier, rawToShares, sharesToRaw } from "@/lib/solana/scaled-ui";
import { USDC_MINT } from "@/config/tickers";
import { livePrices } from "@/lib/services/prices.live";
import { isValidSolanaAddress } from "@/lib/solana/address";
import { DomainError } from "@/lib/api/result";
import { listOrdersForActivity, type OrderRow } from "@/lib/services/orders.supabase";
import {
  walletMovementsStore,
  type WalletMovementRow,
} from "@/lib/services/wallet-movements.supabase";
import { insertCryptoDeposit, listDepositSignatures } from "@/lib/services/deposits.supabase";
import {
  indexSolanaUsdcDeposits,
  type UsdcDepositCandidate,
} from "@/lib/wallet/deposit-indexer";
import {
  DEPOSIT_SCAN_MAX_TOKEN_ACCOUNTS,
  extractUsdcDepositsFromTransactions,
  isDepositLedgerEligible,
  SOLANA_TX_PARSE_OPTIONS,
  type ParsedTxLike,
} from "@/lib/wallet/deposit-sync";
import { listOwnedUsdcTokenAccounts } from "@/lib/solana/usdc-token-accounts";
import { getDefaultWithdrawalStore, reserveWithdrawal } from "@/lib/wallet/withdrawal-store";

const USDC_DECIMALS = 6;
const STOCK_DECIMALS = 8;
const LAMPORTS_PER_SOL = 1_000_000_000;

/** Redondeo a `decimals` decimales, para no arrastrar ruido de coma flotante. */
function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Acciones y costo en USD acumulados de un ticker (base del costo medio). */
interface CostBasis {
  shares: number;
  costUsd: number;
}

/**
 * Costo medio ponderado por ticker con las órdenes confirmadas del usuario.
 * Compra: suma acciones (`out_amount_ui`) y costo (`in_amount_ui`, USDC).
 * Venta: baja acciones y costo de forma proporcional al promedio vigente
 * (`in_amount_ui` = acciones vendidas), nunca bajo cero. Sin usuario o sin
 * órdenes devuelve un mapa vacío: el P&L queda null, no inventado.
 */
async function readConfirmedCostBasis(userId?: string): Promise<Map<string, CostBasis>> {
  const basis = new Map<string, CostBasis>();
  if (!userId) return basis;

  let rows: OrderRow[] = [];
  try {
    rows = await listOrdersForActivity(userId, 200);
  } catch {
    return basis;
  }

  const confirmed = rows
    .filter((row) => row.status === "confirmed")
    .sort((a, b) => (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0));

  for (const row of confirmed) {
    const current = basis.get(row.symbol) ?? { shares: 0, costUsd: 0 };
    if (row.side === "buy") {
      const bought = Number(row.out_amount_ui ?? 0);
      const cost = Number(row.in_amount_ui ?? 0);
      if (bought > 0 && cost > 0) {
        current.shares += bought;
        current.costUsd += cost;
        basis.set(row.symbol, current);
      }
      continue;
    }
    const sold = Number(row.in_amount_ui ?? 0);
    if (sold > 0 && current.shares > 0) {
      const avgCost = current.costUsd / current.shares;
      const soldShares = Math.min(sold, current.shares);
      current.shares = Math.max(0, current.shares - soldShares);
      current.costUsd = Math.max(0, current.costUsd - avgCost * soldShares);
      if (current.shares === 0) current.costUsd = 0;
      basis.set(row.symbol, current);
    }
  }

  return basis;
}

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
  async get(address: string, userId?: string): Promise<Portfolio> {
    if (!isValidSolanaAddress(address)) {
      throw new DomainError("VALIDATION", "La direccion de la billetera no es valida.");
    }
    const connection = getServerConnection();
    const owner = new PublicKey(address);
    const [holdings, costBySymbol] = await Promise.all([
      readHoldings(connection, owner),
      // Costo medio por ticker: sólo órdenes confirmadas, de la más vieja a la
      // más nueva (así la venta parcial usa el promedio vigente).
      readConfirmedCostBasis(userId),
    ]);

    let cashUsdc = 0;
    const stockHoldings = holdings.filter((holding) => classifyMint(holding.mint) === "stock");

    const positions: Position[] = [];
    let positionsValue = 0;
    let pnlTotal = 0;
    let costTotal = 0;
    let hasPnl = false;
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

      // Costo medio de las órdenes confirmadas. Sin precio vivo (> 0) no se
      // calcula P&L: sería una pérdida del 100% inventada por dato faltante.
      const state = costBySymbol.get(symbol);
      const avgCostRaw = state && state.shares > 0 ? state.costUsd / state.shares : 0;
      const avgCost = avgCostRaw > 0 ? round(avgCostRaw, 4) : null;
      const pnlUsd =
        avgCost !== null && avgCost > 0 && shares > 0 && price > 0
          ? round(valueUsd - shares * avgCost, 2)
          : null;
      const pnlPct =
        avgCost !== null && avgCost > 0 && shares > 0 && price > 0
          ? round(((price - avgCost) / avgCost) * 100, 2)
          : null;
      if (avgCost !== null && avgCost > 0 && shares > 0 && price > 0 && pnlUsd !== null && pnlPct !== null) {
        pnlTotal += pnlUsd;
        costTotal += shares * avgCost;
        hasPnl = true;
      }

      positions.push({
        symbol: symbol as Position["symbol"],
        shares,
        multiplier: holding.multiplier,
        avgCostUsd: avgCost !== null && avgCost > 0 && shares > 0 ? avgCost : null,
        priceUsd: price,
        valueUsd,
        pnlUsd,
        pnlPct,
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
      // P&L de la cartera: suma de posiciones con costo conocido y, en %, sobre
      // el costo invertido. Sin órdenes confirmadas queda null.
      pnlUsd: hasPnl ? round(pnlTotal, 2) : null,
      pnlPct: hasPnl && costTotal > 0 ? round((pnlTotal / costTotal) * 100, 2) : null,
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
    // Las cuentas de token y el saldo nativo se leen en paralelo: la cuenta
    // nativa no es una cuenta de token. Si el RPC falla, SOL queda en 0
    // (dato faltante) sin tumbar el resto de los saldos.
    const [holdings, lamports] = await Promise.all([
      readHoldings(connection, owner),
      connection.getBalance(owner).catch(() => 0),
    ]);

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

    // Fila nativa SOL. `valueUsd` 0 es dato faltante (el tipo Balance no admite
    // null y acá no se inventa un precio de SOL en USD).
    balances.push({
      mint: NATIVE_SOL_MINT,
      symbol: "SOL",
      rawAmount: String(lamports),
      uiAmount: round(lamports / LAMPORTS_PER_SOL, 9),
      valueUsd: 0,
    });
    return balances;
  },

  /**
   * Historial real: órdenes (compra/venta) del usuario más los movimientos
   * unificados de `wallet_movements` (depósito, onramp, retiro). Se deduplica
   * por firma contra las órdenes y se ordena del más nuevo al más viejo.
   * Sin órdenes ni movimientos → lista vacía.
   */
  async activity(input: { address: string; userId: string }): Promise<Activity[]> {
    if (!isValidSolanaAddress(input.address)) {
      throw new DomainError("VALIDATION", "La direccion de la billetera no es valida.");
    }
    // Llamada tolerante al libro de movimientos: si falla o el store no expone
    // la función, la actividad de órdenes se devuelve igual.
    const movementsPromise = (async (): Promise<WalletMovementRow[]> => {
      const store = walletMovementsStore as {
        listUserWalletMovements?: (
          i: { userId: string; limit?: number },
        ) => Promise<WalletMovementRow[]>;
      };
      const listUserWalletMovements = store.listUserWalletMovements;
      if (!listUserWalletMovements) return [];
      try {
        return await listUserWalletMovements({ userId: input.userId, limit: 100 });
      } catch {
        return [];
      }
    })();

    const [rows, movements] = await Promise.all([
      listOrdersForActivity(input.userId),
      movementsPromise,
    ]);

    const orders: Activity[] = rows.map((row) => ({
      id: row.id,
      kind: row.side as Activity["kind"],
      symbol: row.symbol,
      amountUi: Number(row.in_amount_ui ?? 0),
      valueUsd: Number(row.out_amount_ui ?? 0) || null,
      status: row.status,
      signature: row.signature,
      at: row.created_at,
    }));

    // La firma de Solana es la misma para la orden y el movimiento: si ya está
    // en las órdenes, el movimiento no se repite.
    const orderSignatures = new Set(
      rows.map((row) => row.signature).filter((signature): signature is string => Boolean(signature)),
    );

    const transfers: Activity[] = movements
      .filter((movement) => !movement.signature || !orderSignatures.has(movement.signature))
      .map((movement) => ({
        id: movement.id,
        kind: movement.kind as Activity["kind"],
        symbol:
          movement.mint === USDC_MINT ? "USDC" : (tickerByMint(movement.mint)?.symbol ?? "USDC"),
        amountUi: movement.amountUi,
        valueUsd: movement.mint === USDC_MINT ? movement.amountUi : null,
        status: "confirmed" as Activity["status"],
        signature: movement.signature,
        at: movement.createdAt,
      }));

    return [...orders, ...transfers].sort(
      (a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0),
    );
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
    const mint = new PublicKey(request.mint);
    const owner = new PublicKey(from);
    const destinationOwner = new PublicKey(to);
    const sendKind = kind === "usdc" ? "usdc" : "stock";
    const decimals = sendKind === "usdc" ? USDC_DECIMALS : STOCK_DECIMALS;
    const multiplier = sendKind === "stock"
      ? await fetchMintMultiplier(connection, request.mint)
      : 1;
    const rawAmount = sendKind === "usdc"
      ? BigInt(Math.round(request.amountUi * 10 ** USDC_DECIMALS))
      : sharesToRaw(request.amountUi, decimals, multiplier);

    // T42: la clave del libro de retiros viaja al cliente en la respuesta, así
    // que se decide antes de armar nada y es la misma que se reserva. Con
    // `requestId` del cliente es determinista (un reintento del armado no abre
    // una segunda salida); sin él lleva el instante del armado.
    const requestKey = request.requestId
      ? `send:${request.requestId}`
      : `send:${request.mint}:${rawAmount.toString()}:${Date.now()}`;

    // Reintento del mismo armado: el libro ya tiene la transacción reservada y
    // es la ÚNICA que el cliente puede firmar (una tx nueva tendría otro
    // blockhash y el submit la rechazaría por integridad).
    if (request.userId && request.requestId) {
      const existing = await getDefaultWithdrawalStore().read(request.userId, requestKey);
      if (
        existing &&
        existing.status === "reserved" &&
        Date.parse(existing.expiresAt) > Date.now()
      ) {
        return {
          requestId: existing.requestId,
          transactionBase64: existing.builtTransactionBase64,
          expiresAt: existing.expiresAt,
        };
      }
    }

    // El mint, el ATA de origen y el ATA de destino se validan contra el
    // programa dueño real antes de armar la transacción.
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const built = await buildSendTransaction({
      connection,
      mint,
      kind: sendKind,
      owner,
      to: destinationOwner,
      rawAmount,
      recentBlockhash: blockhash,
    });

    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    // T42 (D-02): con sesión, la salida queda reservada en el libro antes de
    // devolver la transacción. Sin reserva no hay submit: el tope por
    // operación/día/mes y la idempotencia viven en `wallet_withdrawals`, no en
    // la memoria del proceso.
    if (request.userId) {
      await reserveWithdrawal({
        userId: request.userId,
        requestId: requestKey,
        reference: request.reference?.trim() || requestKey,
        mint: request.mint,
        symbol: tickerByMint(request.mint)?.symbol ?? (request.mint === USDC_MINT ? "USDC" : ""),
        sourceAddress: from,
        destinationAddress: to,
        amountUi: request.amountUi,
        amountUsd: request.notionalUsd ?? request.amountUi,
        builtTransactionBase64: built.transactionBase64,
        expiresAt,
      });
    }

    return {
      requestId: requestKey,
      transactionBase64: built.transactionBase64,
      expiresAt,
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
    const alreadySeen = await listDepositSignatures(input.userId);

    // Firmas recientes de la billetera Y de sus cuentas USDC abiertas (ATA +
    // secundarias). El dueño no firma las transferencias que entran sólo a una
    // secundaria; sin esto, ese depósito no se detectaría. La atribución del
    // monto sigue saliendo del delta neto por dueño en la transacción.
    const tokenAccounts = await listOwnedUsdcTokenAccounts(connection, input.address);
    const targets = [...new Set([input.address, ...tokenAccounts])].slice(
      0,
      DEPOSIT_SCAN_MAX_TOKEN_ACCOUNTS + 1,
    );
    const signatureLists = await Promise.all(
      targets.map((target) =>
        connection.getSignaturesForAddress(new PublicKey(target), { limit: 25 }),
      ),
    );
    const signatures = signatureLists.flat();
    const fresh = [
      ...new Set(
        signatures
          .map((sig) => sig.signature)
          .filter((signature) => signature.trim() !== "" && !alreadySeen.has(signature)),
      ),
    ];
    if (fresh.length === 0) return [];

    const [parsed, statuses] = await Promise.all([
      connection.getParsedTransactions(fresh, SOLANA_TX_PARSE_OPTIONS),
      connection.getSignatureStatuses(fresh, { searchTransactionHistory: true }),
    ]);

    // MISMA regla de libro que el cron: extractor compartido (mint USDC,
    // decimales exactos, delta neto, firma pedida) + `isDepositLedgerEligible`
    // (sólo confirmed/finalized). Un `processed` no acredita.
    const candidates: UsdcDepositCandidate[] = extractUsdcDepositsFromTransactions({
      walletAddress: input.address,
      signatures: fresh,
      transactions: parsed as unknown as ReadonlyArray<ParsedTxLike | null>,
      statuses: statuses.value,
    }).filter((candidate) => isDepositLedgerEligible(candidate.lifecycle));

    if (candidates.length === 0) return [];

    // La firma es la llave: repetir la llamada no duplica el crédito.
    const result = await indexSolanaUsdcDeposits({
      userId: input.userId,
      walletAddress: input.address,
      candidates,
      knownSignatures: alreadySeen,
      deps: {
        listKnownSignatures: async () => alreadySeen,
        insertDeposit: async (deposit) =>
          insertCryptoDeposit({
            userId: deposit.userId,
            mint: deposit.mint,
            amountUi: deposit.amountUi,
            signature: deposit.signature,
            fromAddress: deposit.fromAddress,
          }),
      },
    });

    return result.indexed.map((deposit) => ({
      mint: deposit.mint,
      amountUi: deposit.amountUi,
      signature: deposit.signature,
    }));
  },
};
