import { describe, expect, it } from "vitest";

import { ACCOUNT_COOKIE, parseAccountMode, serializeAccountCookie } from "@/lib/account/mode";
import { DomainError } from "@/lib/api/result";
import { esCL } from "@/content/i18n/es-CL";
import { formatMoney } from "@/lib/format";
import { displayPrice } from "@/lib/market/browse";
import {
  DEMO_INITIAL_USD,
  priceClpOf,
  totalUsdOf,
  validateDemoFunds,
  validateDemoTradeInput,
  weightedAverageCost,
} from "@/lib/services/demo.logic";
import { createDemoUserService, type DemoDeps } from "@/lib/services/demo.supabase";

describe("parseAccountMode", () => {
  it("ausente o inválido -> demo", () => {
    expect(parseAccountMode(undefined)).toBe("demo");
    expect(parseAccountMode(null)).toBe("demo");
    expect(parseAccountMode("")).toBe("demo");
    expect(parseAccountMode("demo")).toBe("demo");
    expect(parseAccountMode("REAL")).toBe("demo");
  });

  it("real -> real", () => {
    expect(parseAccountMode("real")).toBe("real");
  });
});

describe("serializeAccountCookie", () => {
  it("usa la cookie mv_account con path raíz y un año", () => {
    expect(serializeAccountCookie("demo")).toBe(`${ACCOUNT_COOKIE}=demo; path=/; max-age=31536000; SameSite=Lax`);
    expect(serializeAccountCookie("real")).toBe(`${ACCOUNT_COOKIE}=real; path=/; max-age=31536000; SameSite=Lax`);
  });
});

describe("lógica demo en USD (refleja demo_trade de 0007)", () => {
  it("la demo parte con US$10.000 ficticios", () => {
    expect(DEMO_INITIAL_USD).toBe(10_000);
  });

  it("costo promedio ponderado en USD (CLP sólo informativo)", () => {
    const first = weightedAverageCost({
      prevShares: 0,
      prevAvgUsd: 100,
      prevAvgClp: 95000,
      newShares: 10,
      priceUsd: 100,
      priceClp: 95000,
    });
    expect(first).toEqual({ avgUsd: 100, avgClp: 95000, shares: 10 });

    const second = weightedAverageCost({
      prevShares: 10,
      prevAvgUsd: 100,
      prevAvgClp: 95000,
      newShares: 10,
      priceUsd: 200,
      priceClp: 190000,
    });
    expect(second.avgUsd).toBeCloseTo(150, 6);
    expect(second.avgClp).toBeCloseTo(142500, 2);
    expect(second.shares).toBe(20);
  });

  it("total en USD como el SQL", () => {
    expect(totalUsdOf(10, 100)).toBe(1000);
    expect(totalUsdOf(0.5, 200)).toBe(100);
    expect(priceClpOf(100, 950)).toBe(95000);
  });

  it("valida montos y fondos en USD", () => {
    expect(
      validateDemoTradeInput({ symbol: "AAPLx", side: "buy", shares: 1, priceUsd: 100, usdclp: 950 }),
    ).toBeNull();
    expect(validateDemoTradeInput({ symbol: "AAPLx", side: "buy", shares: 1, priceUsd: 100 })).toBeNull();
    expect(
      validateDemoTradeInput({ symbol: "AAPLx", side: "buy", shares: 1, priceUsd: 100, usdclp: null }),
    ).toBeNull();
    expect(
      validateDemoTradeInput({ symbol: "", side: "buy", shares: 1, priceUsd: 100, usdclp: 950 }),
    ).toBe("monto_invalido");
    expect(
      validateDemoTradeInput({ symbol: "AAPLx", side: "buy", shares: 0, priceUsd: 100, usdclp: 950 }),
    ).toBe("monto_invalido");
    expect(
      validateDemoTradeInput({ symbol: "AAPLx", side: "buy", shares: 1, priceUsd: 100, usdclp: 0 }),
    ).toBe("monto_invalido");
    expect(
      validateDemoFunds({ side: "buy", totalUsd: 1000, cashUsd: 1000, shares: 10, positionShares: 0 }),
    ).toBeNull();
    expect(
      validateDemoFunds({ side: "buy", totalUsd: 1000.01, cashUsd: 1000, shares: 11, positionShares: 0 }),
    ).toBe("saldo_insuficiente");
    expect(
      validateDemoFunds({ side: "sell", totalUsd: 0, cashUsd: 0, shares: 5, positionShares: 2 }),
    ).toBe("acciones_insuficientes");
  });
});

type FakeState = {
  cash: number;
  positions: Map<string, { shares: number; avgUsd: number; avgClp: number }>;
  orders: Array<{
    id: string;
    symbol: string;
    side: "buy" | "sell";
    shares: number;
    priceUsd: number;
    usdclp: number | null;
    totalUsd: number;
    createdAt: string;
  }>;
  seq: number;
};

function fakeDeps(state: FakeState, overrides?: Partial<DemoDeps>): DemoDeps {
  return {
    async loadAccount() {
      return { cashUsd: state.cash, initialUsd: 10_000, resetCount: 0 };
    },
    async createAccount() {
      return { cashUsd: state.cash, initialUsd: 10_000, resetCount: 0 };
    },
    async listPositions() {
      return [...state.positions.entries()].map(([symbol, lot]) => ({
        symbol,
        shares: lot.shares,
        avgCostUsd: lot.avgUsd,
        avgCostClp: lot.avgClp,
      }));
    },
    async listOrders() {
      return state.orders.map((row) => ({ ...row }));
    },
    async getOrder(_userId, id) {
      return state.orders.find((row) => row.id === id) ?? null;
    },
    async runTrade(input) {
      const total = Math.round(input.shares * input.priceUsd * 100) / 100;
      if (input.side === "buy") {
        if (state.cash + 1e-9 < total) {
          throw new DomainError("INSUFFICIENT_FUNDS", "saldo_insuficiente");
        }
        state.cash = Math.round((state.cash - total) * 100) / 100;
        const current = state.positions.get(input.symbol);
        const nextShares = (current?.shares ?? 0) + input.shares;
        const avgUsd =
          Math.round(
            (((current?.shares ?? 0) * (current?.avgUsd ?? input.priceUsd) + input.shares * input.priceUsd) /
              nextShares) *
              1_000_000,
          ) / 1_000_000;
        state.positions.set(input.symbol, { shares: nextShares, avgUsd, avgClp: current?.avgClp ?? 0 });
      } else {
        const current = state.positions.get(input.symbol);
        if (!current || current.shares + 1e-9 < input.shares) {
          throw new DomainError("INSUFFICIENT_FUNDS", "acciones_insuficientes");
        }
        state.cash = Math.round((state.cash + total) * 100) / 100;
        const next = current.shares - input.shares;
        if (next <= 0) state.positions.delete(input.symbol);
        else state.positions.set(input.symbol, { ...current, shares: next });
      }
      state.seq += 1;
      state.orders.unshift({
        id: `order-${state.seq}`,
        symbol: input.symbol,
        side: input.side,
        shares: input.shares,
        priceUsd: input.priceUsd,
        usdclp: input.usdclp,
        totalUsd: total,
        createdAt: new Date().toISOString(),
      });
      return { cashUsd: state.cash, totalUsd: total, priceUsd: input.priceUsd };
    },
    async runReset() {
      state.cash = 10_000;
      state.positions.clear();
      state.orders.length = 0;
      return { cashUsd: state.cash, resetCount: 1 };
    },
    async getSpot() {
      return { priceUsd: 100, multiplier: 1 };
    },
    async getFx() {
      return 950;
    },
    ...overrides,
  };
}

function freshState(): FakeState {
  return { cash: 10_000, positions: new Map(), orders: [], seq: 0 };
}

const USER = "11111111-1111-4111-8111-111111111111";
const PUBKEY = "x".repeat(32);

async function buyAndSubmit(
  service: ReturnType<typeof createDemoUserService>,
  request: { side: "buy" | "sell"; symbol: string; amount: number; amountCurrency: "USDC" | "SHARES" | "CLP" },
) {
  const quote = await service.trade.quote(USER, request);
  const built = await service.trade.build(USER, { quoteId: quote.id, userPublicKey: PUBKEY });
  const submitted = await service.trade.submit(USER, {
    requestId: built.requestId,
    signedTransactionBase64: "c2lnbmVk",
  });
  expect(submitted.status).toBe("confirmed");
  return quote;
}

describe("servicio demo por usuario en USD", () => {
  it("cuenta nueva = 10000 USD", async () => {
    const service = createDemoUserService(fakeDeps(freshState()));
    const account = await service.getAccount(USER);
    expect(account.cashUsd).toBe(10_000);
    expect(account.initialUsd).toBe(10_000);
    const portfolio = await service.getPortfolio(USER);
    expect(portfolio.cashUsdc).toBe(10_000);
    expect(portfolio.totalUsd).toBe(10_000);
    expect(portfolio.pnlUsd).toBe(0);
  });

  it("comprar US$100 deja 9900", async () => {
    const service = createDemoUserService(fakeDeps(freshState()));
    const quote = await buyAndSubmit(service, { side: "buy", symbol: "AAPLx", amount: 100, amountCurrency: "USDC" });
    expect(quote.outAmountUi).toBeCloseTo(1, 6);

    const portfolio = await service.getPortfolio(USER);
    expect(portfolio.positions).toHaveLength(1);
    expect(portfolio.positions[0]?.shares).toBeCloseTo(1, 6);
    expect(portfolio.positions[0]?.avgCostUsd).toBeCloseTo(100, 6);
    const account = await service.getAccount(USER);
    expect(account.cashUsd).toBe(9_900);
  });

  it("comprar 0,5 acciones a US$200 deja 9900", async () => {
    const service = createDemoUserService(
      fakeDeps(freshState(), {
        async getSpot() {
          return { priceUsd: 200, multiplier: 1 };
        },
      }),
    );
    await buyAndSubmit(service, { side: "buy", symbol: "AAPLx", amount: 0.5, amountCurrency: "SHARES" });
    const account = await service.getAccount(USER);
    expect(account.cashUsd).toBe(9_900);
  });

  it("vender devuelve según el precio", async () => {
    let price = 100;
    const service = createDemoUserService(
      fakeDeps(freshState(), {
        async getSpot() {
          return { priceUsd: price, multiplier: 1 };
        },
      }),
    );
    await buyAndSubmit(service, { side: "buy", symbol: "AAPLx", amount: 100, amountCurrency: "USDC" });
    price = 120;
    await buyAndSubmit(service, { side: "sell", symbol: "AAPLx", amount: 1, amountCurrency: "SHARES" });
    const account = await service.getAccount(USER);
    expect(account.cashUsd).toBeCloseTo(10_020, 2);
  });

  it("compra sin saldo -> INSUFFICIENT_FUNDS", async () => {
    const state = freshState();
    state.cash = 50;
    const service = createDemoUserService(fakeDeps(state));
    await expect(
      service.trade.quote(USER, { side: "buy", symbol: "AAPLx", amount: 100, amountCurrency: "USDC" }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });

  it("venta sin acciones -> INSUFFICIENT_FUNDS", async () => {
    const service = createDemoUserService(fakeDeps(freshState()));
    await expect(
      service.trade.quote(USER, { side: "sell", symbol: "AAPLx", amount: 1, amountCurrency: "SHARES" }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });

  it("operar sin dólar funciona (precio en USD alcanza)", async () => {
    const service = createDemoUserService(
      fakeDeps(freshState(), {
        async getFx(): Promise<number> {
          throw new DomainError("UPSTREAM", "Dólar no disponible");
        },
      }),
    );
    await buyAndSubmit(service, { side: "buy", symbol: "AAPLx", amount: 100, amountCurrency: "USDC" });
    const account = await service.getAccount(USER);
    expect(account.cashUsd).toBe(9_900);
    const portfolio = await service.getPortfolio(USER);
    expect(portfolio.totalUsd).toBe(10_000);
  });

  it("monto en CLP por API sin dólar -> 400 con mensaje claro", async () => {
    const service = createDemoUserService(
      fakeDeps(freshState(), {
        async getFx(): Promise<number> {
          throw new DomainError("UPSTREAM", "Dólar no disponible");
        },
      }),
    );
    const error = await service.trade
      .quote(USER, { side: "buy", symbol: "AAPLx", amount: 10000, amountCurrency: "CLP" })
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe("VALIDATION");
    expect((error as DomainError).message).toMatch(/dólar/i);
  });

  it("monto en CLP con dólar se convierte a US$", async () => {
    const service = createDemoUserService(fakeDeps(freshState()));
    const quote = await buyAndSubmit(service, {
      side: "buy",
      symbol: "AAPLx",
      amount: 95000,
      amountCurrency: "CLP",
    });
    expect(quote.outAmountUi).toBeCloseTo(1, 6);
    const account = await service.getAccount(USER);
    expect(account.cashUsd).toBe(9_900);
  });

  it("reset vuelve a US$10.000 y 0 posiciones", async () => {
    const state = freshState();
    const service = createDemoUserService(fakeDeps(state));
    await buyAndSubmit(service, { side: "buy", symbol: "AAPLx", amount: 100, amountCurrency: "USDC" });
    expect((await service.getPortfolio(USER)).positions).toHaveLength(1);
    const result = await service.reset(USER);
    expect(result.cashUsd).toBe(10_000);
    const portfolio = await service.getPortfolio(USER);
    expect(portfolio.positions).toHaveLength(0);
    expect(portfolio.totalUsd).toBe(10_000);
    const activity = await service.getActivity(USER);
    expect(activity).toHaveLength(0);
  });
});

describe("visualización en la moneda elegida (M40)", () => {
  it("con CLP y dólar 950, US$1.000 se muestra ≈ $950.000", () => {
    const value = displayPrice(1000, "CLP", 950);
    expect(value).toBe(950000);
    expect(formatMoney(value as number, "CLP")).toBe("$950.000");
  });

  it("con USD se muestra US$1.000,00", () => {
    const value = displayPrice(1000, "USD", 950);
    expect(value).toBe(1000);
    expect(formatMoney(value as number, "USD")).toBe("US$1.000,00");
  });

  it("sin dólar en CLP se muestra en USD con la nota", () => {
    const value = displayPrice(1000, "CLP", undefined);
    expect(value).toBeNull();
    expect(formatMoney(1000, "USD")).toBe("US$1.000,00");
    expect(esCL.detail.fxFallback).toMatch(/dólares/);
  });
});
