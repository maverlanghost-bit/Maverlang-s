import { beforeEach, describe, expect, it, vi } from "vitest";

import { USDC_MINT } from "@/config/tickers";
import { livePortfolio } from "@/lib/services/portfolio.live";
import { NATIVE_SOL_MINT } from "@/lib/solana/allowlist";
import type { OrderRow } from "@/lib/services/orders.supabase";

/**
 * Cartera live: saldo de SOL nativo y costo medio/P&L reales.
 *
 * Dos huecos de dinero que ninguna prueba cubría:
 *
 * 1. `balances` no devolvía el SOL nativo (el gas que el usuario sí tiene en la
 *    billetera). La fila tiene que salir con el crudo exacto en lamports y sin
 *    inventar precio (`valueUsd: 0` = dato faltante, no un precio de cero).
 *    Si el RPC falla, el saldo es 0 y la cartera igual responde.
 * 2. `get` mostraba `avgCostUsd`/`pnl*` siempre null. El costo medio y el P&L
 *    salen de las órdenes confirmadas del usuario, nunca de la cadena: sin
 *    historial quedan null (jamás un número inventado).
 *
 * Se llama al servicio de PRODUCCIÓN (`livePortfolio`); el RPC, los precios y
 * las órdenes están mockeados a nivel de módulo. Sin red, sin base y sin `.env`.
 */

const WALLET = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
/** TSLAx del catálogo curado (mint Token-2022 habilitado). */
const TSLAX = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";

interface OrderCall {
  userId: string;
  limit: number | undefined;
}

const state = vi.hoisted(() => ({
  lamports: 500_000_000,
  getBalanceFails: false,
  balanceCalls: 0,
  /** Cuentas del programa Token-2022 (acciones). */
  tokenAccounts: [] as Array<Record<string, unknown>>,
  /** Cuentas del programa clásico (USDC). */
  classicAccounts: [] as Array<Record<string, unknown>>,
  orders: [] as OrderRow[],
  orderFails: false,
  orderCalls: [] as OrderCall[],
  prices: {} as Record<string, number>,
}));

vi.mock("@/lib/solana/connection", () => ({
  getServerConnection: () => ({
    getParsedTokenAccountsByOwner: async (
      _owner: unknown,
      filter: { programId?: { toBase58?: () => string } },
    ) => {
      const program = filter?.programId?.toBase58?.() ?? "";
      return {
        value:
          program === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
            ? state.tokenAccounts
            : state.classicAccounts,
      };
    },
    getBalance: async () => {
      state.balanceCalls += 1;
      if (state.getBalanceFails) throw new Error("RPC no disponible");
      return state.lamports;
    },
    getParsedAccountInfo: async () => ({
      value: { data: { parsed: { info: { extensions: [] } } } },
    }),
  }),
}));

vi.mock("@/lib/services/prices.live", () => ({
  livePrices: {
    list: async (mints: string[]) =>
      mints.map((mint) => ({
        symbol: mint === TSLAX ? "TSLAx" : "USDC",
        priceUsd: state.prices[mint] ?? 0,
        change24hPct: 0,
        multiplier: 1,
        updatedAt: "2026-11-06T00:00:00.000Z",
        source: "jupiter" as const,
      })),
  },
}));

vi.mock("@/lib/services/orders.supabase", () => ({
  listOrdersForActivity: async (userId: string, limit?: number) => {
    state.orderCalls.push({ userId, limit });
    if (state.orderFails) throw new Error("base no disponible");
    return state.orders;
  },
}));

/** Cuenta de token parseada como la devuelve el RPC. */
function tokenAccount(mint: string, rawAmount: string, decimals: number) {
  return {
    account: {
      data: {
        parsed: {
          info: { mint, tokenAmount: { amount: rawAmount, decimals } },
        },
      },
    },
  };
}

function order(input: {
  id: string;
  side: "buy" | "sell";
  /** Compra: USDC gastado. Venta: acciones vendidas. */
  inAmount: number;
  /** Compra: acciones recibidas. Venta: USDC recibido (puede faltar). */
  outAmount: number | null;
  createdAt: string;
  status?: OrderRow["status"];
  symbol?: string;
}): OrderRow {
  return {
    id: input.id,
    user_id: "user-1",
    side: input.side,
    symbol: input.symbol ?? "TSLAx",
    in_amount_ui: input.inAmount,
    out_amount_ui: input.outAmount,
    fee_bps: 0,
    status: input.status ?? "confirmed",
    signature: null,
    error: null,
    created_at: input.createdAt,
  };
}

beforeEach(() => {
  state.lamports = 500_000_000;
  state.getBalanceFails = false;
  state.balanceCalls = 0;
  state.tokenAccounts = [];
  state.classicAccounts = [];
  state.orders = [];
  state.orderFails = false;
  state.orderCalls = [];
  state.prices = {};
});

describe("balances: el SOL nativo entra a la cartera", () => {
  it("500.000.000 lamports son 0,5 SOL, sin precio inventado", async () => {
    const balances = await livePortfolio.balances(WALLET);

    expect(balances).toEqual([
      {
        mint: NATIVE_SOL_MINT,
        symbol: "SOL",
        rawAmount: "500000000",
        uiAmount: 0.5,
        valueUsd: 0,
      },
    ]);
    expect(state.balanceCalls).toBe(1);
  });

  it("123.456.789 lamports no pierden dígitos", async () => {
    state.lamports = 123_456_789;

    const [sol] = await livePortfolio.balances(WALLET);

    expect(sol?.mint).toBe(NATIVE_SOL_MINT);
    expect(sol?.rawAmount).toBe("123456789");
    expect(sol?.uiAmount).toBeCloseTo(0.123456789, 9);
  });

  it("si el RPC falla, el saldo SOL es 0 y la cartera igual responde", async () => {
    state.getBalanceFails = true;

    const balances = await livePortfolio.balances(WALLET);

    const sol = balances.find((row) => row.mint === NATIVE_SOL_MINT);
    expect(sol?.uiAmount).toBe(0);
    expect(sol?.rawAmount).toBe("0");
    expect(sol?.valueUsd).toBe(0);
  });

  it("el SOL no tapa las cuentas de token (el USDC sigue en la lista)", async () => {
    state.classicAccounts = [tokenAccount(USDC_MINT, "12500000", 6)];

    const balances = await livePortfolio.balances(WALLET);

    expect(balances).toHaveLength(2);
    const usdc = balances.find((row) => row.mint === USDC_MINT);
    expect(usdc?.uiAmount).toBe(12.5);
    expect(usdc?.valueUsd).toBe(12.5);
    expect(balances.find((row) => row.mint === NATIVE_SOL_MINT)?.uiAmount).toBe(0.5);
  });
});

describe("get: costo medio y P&L desde las órdenes confirmadas", () => {
  it("dos compras confirmed dan promedio ponderado y P&L a favor", async () => {
    state.tokenAccounts = [tokenAccount(TSLAX, "200000000", 8)]; // 2 acciones
    state.prices = { [TSLAX]: 300 };
    state.orders = [
      order({ id: "o-2", side: "buy", inAmount: 200, outAmount: 1, createdAt: "2026-11-02T10:00:00.000Z" }),
      order({ id: "o-1", side: "buy", inAmount: 100, outAmount: 1, createdAt: "2026-11-01T10:00:00.000Z" }),
    ];

    const portfolio = await livePortfolio.get(WALLET, "user-1");
    const position = portfolio.positions[0];

    expect(position?.symbol).toBe("TSLAx");
    expect(position?.shares).toBe(2);
    expect(position?.avgCostUsd).toBe(150); // (100 + 200) / 2
    expect(position?.valueUsd).toBe(600);
    expect(position?.pnlUsd).toBe(300); // 600 − 2 × 150
    expect(position?.pnlPct).toBe(100); // (300 − 150) / 150
    expect(portfolio.pnlUsd).toBe(300);
    expect(portfolio.pnlPct).toBe(100);
  });

  it("con el precio bajo el costo, el P&L queda en contra", async () => {
    state.tokenAccounts = [tokenAccount(TSLAX, "200000000", 8)];
    state.prices = { [TSLAX]: 100 };
    state.orders = [
      order({ id: "o-2", side: "buy", inAmount: 200, outAmount: 1, createdAt: "2026-11-02T10:00:00.000Z" }),
      order({ id: "o-1", side: "buy", inAmount: 100, outAmount: 1, createdAt: "2026-11-01T10:00:00.000Z" }),
    ];

    const portfolio = await livePortfolio.get(WALLET, "user-1");
    const position = portfolio.positions[0];

    expect(position?.avgCostUsd).toBe(150);
    expect(position?.pnlUsd).toBe(-100); // 200 − 300
    expect(position?.pnlPct).toBe(-33.33);
    expect(portfolio.pnlUsd).toBe(-100);
    expect(portfolio.pnlPct).toBe(-33.33);
  });

  it("una venta parcial baja las acciones y el costo, y las no confirmadas no cuentan", async () => {
    state.tokenAccounts = [tokenAccount(TSLAX, "100000000", 8)]; // queda 1 acción
    state.prices = { [TSLAX]: 250 };
    // Orden de la base: más recientes primero. La `failed` no debe mover nada.
    state.orders = [
      order({ id: "venta", side: "sell", inAmount: 1, outAmount: 250, createdAt: "2026-11-03T10:00:00.000Z" }),
      order({
        id: "fallida",
        side: "buy",
        inAmount: 1,
        outAmount: 100,
        createdAt: "2026-11-02T10:00:00.000Z",
        status: "failed",
      }),
      order({ id: "compra", side: "buy", inAmount: 400, outAmount: 2, createdAt: "2026-11-01T10:00:00.000Z" }),
    ];

    const portfolio = await livePortfolio.get(WALLET, "user-1");
    const position = portfolio.positions[0];

    expect(position?.shares).toBe(1);
    expect(position?.avgCostUsd).toBe(200); // 400 − 200 × 1
    expect(position?.pnlUsd).toBe(50); // 250 − 200
    expect(position?.pnlPct).toBe(25);
    expect(portfolio.pnlUsd).toBe(50);
    expect(portfolio.pnlPct).toBe(25);
  });

  it("vender más de lo comprado no deja costo ni P&L negativos", async () => {
    state.tokenAccounts = [tokenAccount(TSLAX, "100000000", 8)];
    state.prices = { [TSLAX]: 250 };
    state.orders = [
      order({ id: "venta", side: "sell", inAmount: 3, outAmount: 750, createdAt: "2026-11-03T10:00:00.000Z" }),
      order({ id: "compra", side: "buy", inAmount: 400, outAmount: 2, createdAt: "2026-11-01T10:00:00.000Z" }),
    ];

    const portfolio = await livePortfolio.get(WALLET, "user-1");
    const position = portfolio.positions[0];

    expect(position?.shares).toBe(1);
    expect(position?.avgCostUsd).toBeNull();
    expect(position?.pnlUsd).toBeNull();
    expect(portfolio.pnlUsd).toBeNull();
    expect(portfolio.pnlPct).toBeNull();
  });

  it("sin userId no se leen órdenes y el P&L queda null", async () => {
    state.tokenAccounts = [tokenAccount(TSLAX, "200000000", 8)];
    state.prices = { [TSLAX]: 300 };
    state.orders = [
      order({ id: "o-1", side: "buy", inAmount: 100, outAmount: 1, createdAt: "2026-11-01T10:00:00.000Z" }),
    ];

    const portfolio = await livePortfolio.get(WALLET);
    const position = portfolio.positions[0];

    expect(state.orderCalls).toHaveLength(0);
    expect(position?.shares).toBe(2);
    expect(position?.avgCostUsd).toBeNull();
    expect(position?.pnlUsd).toBeNull();
    expect(position?.pnlPct).toBeNull();
    expect(portfolio.pnlUsd).toBeNull();
    expect(portfolio.pnlPct).toBeNull();
  });

  it("con userId y sin órdenes pide el historial (tope 200) y deja el P&L null", async () => {
    state.tokenAccounts = [tokenAccount(TSLAX, "200000000", 8)];
    state.prices = { [TSLAX]: 300 };

    const portfolio = await livePortfolio.get(WALLET, "user-1");
    const position = portfolio.positions[0];

    expect(state.orderCalls).toEqual([{ userId: "user-1", limit: 200 }]);
    expect(position?.avgCostUsd).toBeNull();
    expect(position?.pnlUsd).toBeNull();
    expect(portfolio.pnlUsd).toBeNull();
    expect(portfolio.pnlPct).toBeNull();
  });

  it("si la lectura de órdenes falla, la cartera se devuelve igual y sin P&L", async () => {
    state.tokenAccounts = [tokenAccount(TSLAX, "200000000", 8)];
    state.prices = { [TSLAX]: 300 };
    state.orderFails = true;

    const portfolio = await livePortfolio.get(WALLET, "user-1");
    const position = portfolio.positions[0];

    expect(position?.valueUsd).toBe(600);
    expect(position?.avgCostUsd).toBeNull();
    expect(position?.pnlUsd).toBeNull();
    expect(portfolio.pnlUsd).toBeNull();
  });
});
