import "server-only";

import { defaultSlippageBps, feeConfig, priceDeviationMaxBps } from "@/config/fees";
import { USDC_MINT } from "@/config/tickers";
import { DomainError } from "@/lib/api/result";
import { findAssetBySymbol } from "@/lib/catalog/assets";
import { tradableBySymbol } from "@/lib/catalog/tradable";
import { getServices } from "@/lib/services";
import { DEMO_INITIAL_USD, totalUsdOf, validateDemoFunds, validateDemoTradeInput } from "@/lib/services/demo.logic";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { roundDigits } from "@/lib/mocks/number";
import { hashSeed } from "@/lib/mocks/prng";
import { tickerBySymbol } from "@/lib/solana/allowlist";
import { NETWORK_FEE_SOL, TOKEN_ACCOUNT_RENT_SOL } from "@/lib/wallet/send-cost";
import type {
  Activity,
  Balance,
  Order,
  Portfolio,
  Quote,
  Side,
  TradeBuildRequest,
  TradeBuildResponse,
  TradeQuote,
  TradeQuoteRequest,
  TradeSubmitRequest,
  TradeSubmitResponse,
} from "@/lib/types";

/**
 * Cuenta demo por usuario en Supabase (tablas de 0003, saldo en USD desde 0007).
 * El precio sale del mismo servicio de precios de la ficha. El dólar sólo se
 * usa para los montos en CLP que lleguen por API y para mostrar en CLP:
 * sin dólar igual se puede operar en USD o en acciones, y la UI muestra
 * en dólares con la nota de respaldo. Nada se inventa.
 * Las escrituras van con la secret key (service_role) vía rpc `demo_trade`.
 */

const QUOTE_TTL_MS = 60_000;

export { DEMO_INITIAL_USD };

const PRICE_MESSAGE = "No pudimos obtener el precio, intenta en un momento.";
const FX_MESSAGE = "No pudimos obtener el dólar, intenta en un momento.";
const FX_CLP_MESSAGE = "Sin dólar no podemos convertir pesos a dólares. Prueba en unos minutos.";

export type DemoAccountRow = { cashUsd: number; initialUsd: number; resetCount: number };

export type DemoPositionRow = {
  symbol: string;
  shares: number;
  avgCostUsd: number;
  avgCostClp: number;
};

export type DemoOrderRow = {
  id: string;
  symbol: string;
  side: Side;
  shares: number;
  priceUsd: number;
  /** Informativo, puede ser null (el historial viejo no trae total_usd). */
  usdclp: number | null;
  totalUsd: number | null;
  createdAt: string;
};

export type DemoSpot = { priceUsd: number; multiplier: number };

export type DemoDeps = {
  loadAccount(userId: string): Promise<DemoAccountRow | null>;
  createAccount(userId: string): Promise<DemoAccountRow>;
  listPositions(userId: string): Promise<DemoPositionRow[]>;
  listOrders(userId: string): Promise<DemoOrderRow[]>;
  getOrder(userId: string, id: string): Promise<DemoOrderRow | null>;
  runTrade(input: {
    userId: string;
    symbol: string;
    side: Side;
    shares: number;
    priceUsd: number;
    /** Opcional: si no viene, el SQL deja usdclp/total_clp en null. */
    usdclp: number | null;
  }): Promise<{ cashUsd: number; totalUsd: number; priceUsd: number }>;
  runReset(userId: string): Promise<{ cashUsd: number; resetCount: number }>;
  getSpot(symbol: string): Promise<DemoSpot>;
  /** Sólo se usa para montos en CLP por API y nunca para operar en USD. */
  getFx(): Promise<number>;
};

type StoredQuote = {
  quote: TradeQuote;
  shares: number;
  usdc: number;
  userId: string;
  priceUsd: number;
  /** Null cuando se cotizó sin dólar (sólo USD o acciones). */
  fx: number | null;
};

type StoredBuild = {
  requestId: string;
  quoteId: string;
  userId: string;
  expiresAt: string;
  orderId: string | null;
};

function sqlErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  for (const code of ["saldo_insuficiente", "acciones_insuficientes", "monto_invalido"]) {
    if (message.includes(code)) return code;
  }
  return null;
}

function failFromSql(error: unknown): Error {
  const code = sqlErrorCode(error);
  if (code === "saldo_insuficiente" || code === "acciones_insuficientes") {
    return new DomainError("INSUFFICIENT_FUNDS", "No tienes saldo suficiente.");
  }
  if (code === "monto_invalido") return new DomainError("VALIDATION", "Revisa el monto e inténtalo de nuevo.");
  if (error instanceof DomainError) return error;
  return new DomainError("INTERNAL", "No pudimos completar la orden.");
}

async function requireTradable(symbol: string) {
  const asset = await tradableBySymbol(symbol);
  if (asset) return asset;
  // Visible pero no operable (watch, hidden, transición apagada, deshabilitada) → MINT_NOT_ALLOWED.
  const visible = await findAssetBySymbol(symbol, { scope: "all", allowHidden: true }).catch(() => null);
  if (visible) throw new DomainError("MINT_NOT_ALLOWED");
  const known = tickerBySymbol(symbol);
  if (known) throw new DomainError("MINT_NOT_ALLOWED");
  throw new DomainError("NOT_FOUND", "No encontramos esa acción.");
}

/** Mint y decimales para mostrar saldos: snapshot primero, catálogo después (M54). */
async function mintForBalances(symbol: string): Promise<{ mint: string; decimals: 8 } | null> {
  const ticker = tickerBySymbol(symbol);
  if (ticker) return { mint: ticker.mint, decimals: ticker.decimals };
  const asset = await findAssetBySymbol(symbol, { scope: "all" }).catch(() => null);
  if (!asset || !asset.mint) return null;
  return { mint: asset.mint, decimals: 8 };
}

function deviationFor(symbol: string): number {
  return hashSeed(`dev:${symbol}`) % 40;
}

function encodeDemoTx(label: string): string {
  const bytes = new TextEncoder().encode(label);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function expired(iso: string): boolean {
  return Date.now() > Date.parse(iso);
}

function toActivity(row: DemoOrderRow): Activity {
  // El historial viejo no trae total_usd: se calcula como acciones × precio.
  const valueUsd = row.totalUsd ?? roundDigits(row.shares * row.priceUsd, 2);
  return {
    id: row.id,
    kind: row.side,
    symbol: row.symbol,
    amountUi: row.shares,
    valueUsd,
    status: "confirmed",
    signature: null,
    at: row.createdAt,
  };
}

function toOrder(userId: string, row: DemoOrderRow, feeBps: number): Order {
  const usdc = roundDigits(row.shares * row.priceUsd, 6);
  return {
    id: row.id,
    userId,
    side: row.side,
    symbol: row.symbol,
    inAmountUi: row.side === "buy" ? usdc : row.shares,
    outAmountUi: row.side === "buy" ? row.shares : usdc,
    feeBps,
    status: "confirmed",
    signature: null,
    createdAt: row.createdAt,
  };
}

async function realSpot(symbol: string): Promise<DemoSpot> {
  let quotes: Quote[];
  try {
    quotes = await getServices().prices.list([symbol]);
  } catch {
    throw new DomainError("UPSTREAM", PRICE_MESSAGE);
  }
  const quote = quotes[0];
  if (!quote || !(quote.priceUsd > 0) || quote.reference) {
    throw new DomainError("UPSTREAM", PRICE_MESSAGE);
  }
  return { priceUsd: quote.priceUsd, multiplier: quote.multiplier > 0 ? quote.multiplier : 1 };
}

async function realFx(): Promise<number> {
  try {
    const fx = await getServices().prices.fx();
    if (!(fx.rate > 0) || !Number.isFinite(fx.rate)) throw new DomainError("UPSTREAM", FX_MESSAGE);
    return fx.rate;
  } catch (error) {
    if (error instanceof DomainError) return Promise.reject(new DomainError(error.code, FX_MESSAGE));
    return Promise.reject(new DomainError("UPSTREAM", FX_MESSAGE));
  }
}

function num(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : (value as number);
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "string" ? Number(value) : (value as number);
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

function realDeps(): DemoDeps {
  async function loadAccount(userId: string): Promise<DemoAccountRow | null> {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("demo_accounts")
      .select("cash_usd,initial_usd,reset_count")
      .eq("user_id", userId)
      .single();
    if (error || !data) return null;
    return {
      cashUsd: num(data.cash_usd),
      initialUsd: num(data.initial_usd),
      resetCount: num(data.reset_count),
    };
  }

  return {
    loadAccount,
    async createAccount(userId) {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin
        .from("demo_accounts")
        .insert({ user_id: userId })
        .select("cash_usd,initial_usd,reset_count")
        .single();
      if (error || !data) {
        const existing = await loadAccount(userId);
        if (existing) return existing;
        throw new DomainError("INTERNAL", "No pudimos crear tu cuenta demo.");
      }
      return {
        cashUsd: num(data.cash_usd),
        initialUsd: num(data.initial_usd),
        resetCount: num(data.reset_count),
      };
    },
    async listPositions(userId) {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin
        .from("demo_positions")
        .select("symbol,shares,avg_cost_usd,avg_cost_clp")
        .eq("user_id", userId);
      if (error || !data) return [];
      return (data as Array<Record<string, unknown>>).map((row) => ({
        symbol: String(row.symbol ?? ""),
        shares: num(row.shares),
        avgCostUsd: num(row.avg_cost_usd),
        avgCostClp: num(row.avg_cost_clp),
      }));
    },
    async listOrders(userId) {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin
        .from("demo_orders")
        .select("id,symbol,side,shares,price_usd,usdclp,total_usd,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error || !data) return [];
      return (data as Array<Record<string, unknown>>)
        .map((row) => ({
          id: String(row.id ?? ""),
          symbol: String(row.symbol ?? ""),
          side: (row.side === "sell" ? "sell" : "buy") as Side,
          shares: num(row.shares),
          priceUsd: num(row.price_usd),
          usdclp: numOrNull(row.usdclp),
          totalUsd: numOrNull(row.total_usd),
          createdAt: String(row.created_at ?? new Date().toISOString()),
        }))
        .filter((row) => row.id !== "" && row.symbol !== "");
    },
    async getOrder(userId, id) {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin
        .from("demo_orders")
        .select("id,symbol,side,shares,price_usd,usdclp,total_usd,created_at")
        .eq("user_id", userId)
        .eq("id", id)
        .single();
      if (error || !data) return null;
      return {
        id: String(data.id ?? ""),
        symbol: String(data.symbol ?? ""),
        side: (data.side === "sell" ? "sell" : "buy") as Side,
        shares: num(data.shares),
        priceUsd: num(data.price_usd),
        usdclp: numOrNull(data.usdclp),
        totalUsd: numOrNull(data.total_usd),
        createdAt: String(data.created_at ?? new Date().toISOString()),
      };
    },
    async runTrade(input) {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.rpc("demo_trade", {
        p_user: input.userId,
        p_symbol: input.symbol,
        p_side: input.side,
        p_shares: input.shares,
        p_price_usd: input.priceUsd,
        p_usdclp: input.usdclp,
      });
      if (error) throw failFromSql(error);
      const row = data as { cash_usd?: unknown; total_usd?: unknown; price_usd?: unknown } | null;
      return {
        cashUsd: num(row?.cash_usd),
        totalUsd: num(row?.total_usd),
        priceUsd: num(row?.price_usd),
      };
    },
    async runReset(userId) {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.rpc("demo_reset", { p_user: userId });
      if (error) throw new DomainError("INTERNAL", "No pudimos reiniciar tu cuenta demo.");
      const row = data as { cash_usd?: unknown; reset_count?: unknown } | null;
      return { cashUsd: num(row?.cash_usd), resetCount: Math.trunc(num(row?.reset_count)) };
    },
    getSpot: realSpot,
    getFx: realFx,
  };
}

/**
 * Servicio demo por usuario. `deps` se inyecta en tests; en producción usa
 * el admin de Supabase y los precios reales. Las cotizaciones en curso viven
 * en memoria (60 s): sólo el saldo, las posiciones y las órdenes persisten.
 */
export function createDemoUserService(deps: DemoDeps) {
  const quotes = new Map<string, StoredQuote>();
  const builds = new Map<string, StoredBuild>();
  const orders = new Map<string, Order>();
  let seq = 0;

  function nextId(prefix: string): string {
    seq += 1;
    return `${prefix}-${Date.now().toString(36)}-${seq}`;
  }

  async function ensureAccount(userId: string): Promise<DemoAccountRow> {
    const existing = await deps.loadAccount(userId);
    if (existing) return existing;
    return deps.createAccount(userId);
  }

  async function spotLenient(symbol: string, fallbackUsd: number): Promise<DemoSpot> {
    try {
      return await deps.getSpot(symbol);
    } catch {
      return { priceUsd: fallbackUsd > 0 ? fallbackUsd : 0, multiplier: 1 };
    }
  }

  async function portfolioRows(userId: string) {
    const [account, positions] = await Promise.all([ensureAccount(userId), deps.listPositions(userId)]);
    const held = positions.filter((row) => row.shares > 0);
    const spots = new Map<string, DemoSpot>();
    await Promise.all(
      held.map(async (row) => {
        spots.set(row.symbol, await spotLenient(row.symbol, row.avgCostUsd));
      }),
    );
    return { account, positions: held, spots };
  }

  return {
    async getAccount(userId: string): Promise<DemoAccountRow> {
      return ensureAccount(userId);
    },

    async getPortfolio(userId: string): Promise<Portfolio> {
      const { account, positions, spots } = await portfolioRows(userId);
      const cashUsdc = roundDigits(account.cashUsd, 6);
      const updatedAt = new Date().toISOString();
      const priced = positions.map((row) => {
        const spot = spots.get(row.symbol) ?? { priceUsd: row.avgCostUsd, multiplier: 1 };
        const valueUsd = roundDigits(row.shares * spot.priceUsd, 2);
        return { row, spot, valueUsd };
      });
      const investedUsd = priced.reduce((sum, item) => sum + item.valueUsd, 0);
      const totalUsd = roundDigits(investedUsd + cashUsdc, 2);
      // Rendimiento contra el inicial: (efectivo + posiciones a precio actual) − initialUsd.
      const pnlUsd = roundDigits(totalUsd - account.initialUsd, 2);
      const pnlPct = account.initialUsd > 0 ? pnlUsd / account.initialUsd : null;
      return {
        address: userId,
        totalUsd,
        cashUsdc,
        positions: priced.map((item) => ({
          symbol: item.row.symbol,
          shares: item.row.shares,
          multiplier: item.spot.multiplier,
          avgCostUsd: item.row.avgCostUsd,
          priceUsd: item.spot.priceUsd,
          valueUsd: item.valueUsd,
          pnlUsd: roundDigits(item.valueUsd - item.row.shares * item.row.avgCostUsd, 2),
          pnlPct:
            item.row.avgCostUsd === 0
              ? null
              : (item.spot.priceUsd - item.row.avgCostUsd) / item.row.avgCostUsd,
          allocationPct: totalUsd > 0 ? item.valueUsd / totalUsd : 0,
        })),
        pnlUsd,
        pnlPct,
        updatedAt,
      };
    },

    async getBalances(userId: string): Promise<Balance[]> {
      const { account, positions, spots } = await portfolioRows(userId);
      const cashUsdc = roundDigits(account.cashUsd, 6);
      const cashRaw = BigInt(Math.round(cashUsdc * 10 ** 6));
      const balances: Balance[] = [
        {
          mint: USDC_MINT,
          symbol: "USDC",
          rawAmount: cashRaw.toString(),
          uiAmount: Number(cashRaw) / 10 ** 6,
          valueUsd: roundDigits(cashUsdc, 2),
        },
      ];
      for (const row of positions) {
        const resolved = await mintForBalances(row.symbol);
        if (!resolved) continue;
        const spot = spots.get(row.symbol) ?? { priceUsd: row.avgCostUsd, multiplier: 1 };
        const raw = BigInt(Math.round((row.shares / spot.multiplier) * 10 ** resolved.decimals));
        const uiAmount = (Number(raw) * spot.multiplier) / 10 ** resolved.decimals;
        balances.push({
          mint: resolved.mint,
          symbol: row.symbol,
          rawAmount: raw.toString(),
          uiAmount,
          valueUsd: roundDigits(uiAmount * spot.priceUsd, 2),
        });
      }
      return balances;
    },

    async getActivity(userId: string): Promise<Activity[]> {
      await ensureAccount(userId);
      const rows = await deps.listOrders(userId);
      return rows.map(toActivity);
    },

    trade: {
      async quote(userId: string, request: TradeQuoteRequest): Promise<TradeQuote> {
        if (!(request.amount > 0) || !Number.isFinite(request.amount)) {
          throw new DomainError("VALIDATION", "El monto tiene que ser mayor que cero.");
        }
        const ticker = await requireTradable(request.symbol);
        if (feeConfig.bps > 0 && !feeConfig.wallet) {
          throw new DomainError("INTERNAL", "Falta la billetera de comisión.");
        }
        const needsFx = request.amountCurrency === "CLP";
        const [spot, account, positions] = await Promise.all([
          deps.getSpot(ticker.symbol).catch((error: unknown) => {
            if (error instanceof DomainError) throw new DomainError(error.code, PRICE_MESSAGE);
            throw new DomainError("UPSTREAM", PRICE_MESSAGE);
          }),
          ensureAccount(userId),
          deps.listPositions(userId),
        ]);
        // El dólar sólo se usa para montos en CLP por API. Sin dólar igual se
        // opera en USD o en acciones; en CLP se rechaza con un 400 claro.
        let fx: number | null = null;
        if (needsFx) {
          try {
            fx = await deps.getFx();
          } catch {
            throw new DomainError("VALIDATION", FX_CLP_MESSAGE);
          }
          if (!(fx > 0) || !Number.isFinite(fx)) {
            throw new DomainError("VALIDATION", FX_CLP_MESSAGE);
          }
        }
        const price = spot.priceUsd;
        let notionalUsd: number;
        if (request.amountCurrency === "SHARES") notionalUsd = request.amount * price;
        else if (request.amountCurrency === "CLP") notionalUsd = request.amount / (fx as number);
        else notionalUsd = request.amount;

        const feeUsd = roundDigits((notionalUsd * feeConfig.bps) / 10_000, 6);
        let shares: number;
        let usdc: number;
        if (request.side === "buy") {
          if (request.amountCurrency === "SHARES") {
            shares = request.amount;
            usdc = notionalUsd + feeUsd;
          } else {
            usdc = notionalUsd;
            const net = notionalUsd - feeUsd;
            if (net <= 0) throw new DomainError("VALIDATION", "La comisión se come el monto.");
            shares = net / price;
          }
          const totalUsd = totalUsdOf(roundDigits(shares, 8), price);
          const held = positions.find((row) => row.symbol === ticker.symbol)?.shares ?? 0;
          const funds = validateDemoFunds({
            side: "buy",
            totalUsd,
            cashUsd: account.cashUsd,
            shares,
            positionShares: held,
          });
          if (funds === "saldo_insuficiente") throw new DomainError("INSUFFICIENT_FUNDS");
        } else if (request.amountCurrency === "SHARES") {
          shares = request.amount;
          usdc = Math.max(0, notionalUsd - feeUsd);
        } else {
          usdc = notionalUsd;
          shares = (notionalUsd + feeUsd) / price;
        }

        shares = roundDigits(shares, 8);
        usdc = roundDigits(usdc, 6);
        if (shares <= 0 || usdc < 0) throw new DomainError("VALIDATION", "El monto es demasiado bajo.");
        if (request.side === "sell") {
          const held = positions.find((row) => row.symbol === ticker.symbol)?.shares ?? 0;
          const funds = validateDemoFunds({
            side: "sell",
            totalUsd: 0,
            cashUsd: account.cashUsd,
            shares,
            positionShares: held,
          });
          if (funds === "acciones_insuficientes") throw new DomainError("INSUFFICIENT_FUNDS");
        }

        const deviation = deviationFor(ticker.symbol);
        if (deviation > priceDeviationMaxBps) throw new DomainError("PRICE_DEVIATION");

        const heldNow = positions.find((row) => row.symbol === ticker.symbol)?.shares ?? 0;
        const opensAccount = request.side === "buy" && heldNow <= 0;
        const quote: TradeQuote = {
          id: nextId("quote"),
          side: request.side,
          symbol: ticker.symbol,
          inAmountUi: request.side === "buy" ? usdc : shares,
          outAmountUi: request.side === "buy" ? shares : usdc,
          pricePerShareUsd: price,
          costs: {
            platformFeeUsd: feeUsd,
            platformFeeBps: feeConfig.bps,
            networkFeeSol: NETWORK_FEE_SOL,
            tokenAccountRentSol: opensAccount ? TOKEN_ACCOUNT_RENT_SOL : 0,
            priceImpactPct: 0,
            slippageBps: defaultSlippageBps,
          },
          priceDeviationBps: deviation,
          expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
          route: "mock",
        };
        quotes.set(quote.id, { quote, shares, usdc, userId, priceUsd: price, fx });
        return quote;
      },

      async build(userId: string, request: TradeBuildRequest): Promise<TradeBuildResponse> {
        const stored = quotes.get(request.quoteId);
        if (!stored || stored.userId !== userId) {
          throw new DomainError("NOT_FOUND", "No encontramos esa cotización.");
        }
        if (expired(stored.quote.expiresAt)) throw new DomainError("QUOTE_EXPIRED");
        if (request.userPublicKey.trim().length < 32) {
          throw new DomainError("VALIDATION", "Falta la billetera.");
        }
        const response: TradeBuildResponse = {
          requestId: nextId("build"),
          transactionBase64: encodeDemoTx(`demo-tx:${request.quoteId}`),
          expiresAt: stored.quote.expiresAt,
        };
        builds.set(response.requestId, {
          requestId: response.requestId,
          quoteId: stored.quote.id,
          userId,
          expiresAt: response.expiresAt,
          orderId: null,
        });
        return response;
      },

      async submit(userId: string, request: TradeSubmitRequest): Promise<TradeSubmitResponse> {
        const build = builds.get(request.requestId);
        if (!build || build.userId !== userId) {
          throw new DomainError("NOT_FOUND", "No encontramos esa orden.");
        }
        if (build.orderId) {
          const existing = orders.get(build.orderId);
          if (!existing) throw new DomainError("NOT_FOUND", "No encontramos esa orden.");
          return { orderId: existing.id, signature: existing.signature, status: existing.status };
        }
        if (request.signedTransactionBase64.trim() === "") {
          throw new DomainError("VALIDATION", "Falta la transacción firmada.");
        }
        const stored = quotes.get(build.quoteId);
        if (!stored || stored.userId !== userId) {
          throw new DomainError("NOT_FOUND", "No encontramos esa cotización.");
        }
        if (expired(build.expiresAt) || expired(stored.quote.expiresAt)) throw new DomainError("QUOTE_EXPIRED");
        const invalid = validateDemoTradeInput({
          symbol: stored.quote.symbol,
          side: stored.quote.side,
          shares: stored.shares,
          priceUsd: stored.priceUsd,
          usdclp: stored.fx,
        });
        if (invalid) throw new DomainError("VALIDATION", "Revisa el monto e inténtalo de nuevo.");

        try {
          await deps.runTrade({
            userId,
            symbol: stored.quote.symbol,
            side: stored.quote.side,
            shares: stored.shares,
            priceUsd: stored.priceUsd,
            usdclp: stored.fx,
          });
        } catch (error) {
          const failed: Order = {
            id: nextId("order"),
            userId,
            side: stored.quote.side,
            symbol: stored.quote.symbol,
            inAmountUi: stored.quote.inAmountUi,
            outAmountUi: stored.quote.outAmountUi,
            feeBps: stored.quote.costs.platformFeeBps,
            status: "failed",
            signature: null,
            error: error instanceof DomainError ? error.message : "No se pudo ejecutar.",
            createdAt: new Date().toISOString(),
          };
          orders.set(failed.id, failed);
          builds.set(build.requestId, { ...build, orderId: failed.id });
          return { orderId: failed.id, signature: null, status: "failed" };
        }

        const createdAt = new Date().toISOString();
        const confirmed: Order = {
          id: nextId("order"),
          userId,
          side: stored.quote.side,
          symbol: stored.quote.symbol,
          inAmountUi: stored.quote.inAmountUi,
          outAmountUi: stored.quote.outAmountUi,
          feeBps: stored.quote.costs.platformFeeBps,
          status: "confirmed",
          signature: null,
          createdAt,
        };
        orders.set(confirmed.id, confirmed);
        builds.set(build.requestId, { ...build, orderId: confirmed.id });
        return { orderId: confirmed.id, signature: null, status: "confirmed" };
      },

      async status(userId: string, id: string): Promise<Order> {
        const existing = orders.get(id);
        if (existing && existing.userId === userId) return { ...existing };
        const row = await deps.getOrder(userId, id);
        if (!row) throw new DomainError("NOT_FOUND", "No encontramos esa orden.");
        return toOrder(userId, row, feeConfig.bps);
      },
    },

    async reset(userId: string): Promise<{ cashUsd: number; resetCount: number }> {
      return deps.runReset(userId);
    },
  };
}

/** Servicio con Supabase y precios reales. Sólo en servidor con sesión Supabase. */
export const demoSupabase = createDemoUserService(realDeps());
