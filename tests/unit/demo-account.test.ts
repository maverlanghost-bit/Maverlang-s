import { describe, expect, it } from "vitest";

import { ACCOUNT_COOKIE, parseAccountMode, serializeAccountCookie } from "@/lib/account/mode";
import { DomainError } from "@/lib/api/result";
import {
  priceClpOf,
  totalClpOf,
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

describe("lógica demo (refleja demo_trade)", () => {
  it("costo promedio ponderado en USD y CLP", () => {
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

  it("precio y total en CLP como el SQL", () => {
    expect(priceClpOf(100, 950)).toBe(95000);
    expect(totalClpOf(10, 100, 950)).toBe(950000);
  });

  it("valida montos y fondos", () => {
    expect(
      validateDemoTradeInput({ symbol: "AAPLx", side: "buy", shares: 1, priceUsd: 100, usdclp: 950 }),
    ).toBeNull();
    expect(
      validateDemoTradeInput({ symbol: "", side: "buy", shares: 1, priceUsd: 100, usdclp: 950 }),
    ).toBe("monto_invalido");
    expect(
      validateDemoTradeInput({ symbol: "AAPLx", side: "buy", shares: 0, priceUsd: 100, usdclp: 950 }),
    ).toBe("monto_invalido");
    expect(
      validateDemoFunds({ side: "buy", totalClp: 950000, cashClp: 1000000, shares: 10, positionShares: 0 }),
    ).toBeNull();
    expect(
      validateDemoFunds({ side: "buy", totalClp: 1000001, cashClp: 1000000, shares: 11, positionShares: 0 }),
    ).toBe("saldo_insuficiente");
    expect(
      validateDemoFunds({ side: "sell", totalClp: 0, cashClp: 0, shares: 5, positionShares: 2 }),
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
    usdclp: number;
    totalClp: number;
    createdAt: string;
  }>;
  seq: number;
};

function fakeDeps(state: FakeState, overrides?: Partial<DemoDeps>): DemoDeps {
  return {
    async loadAccount() {
      return { cashClp: state.cash, initialClp: 1000000, resetCount: 0 };
    },
    async createAccount() {
      return { cashClp: state.cash, initialClp: 1000000, resetCount: 0 };
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
      const total = Math.round(input.shares * Math.round(input.priceUsd * input.usdclp * 100) / 100 * 100) / 100;
      if (input.side === "buy") {
        if (state.cash + 1e-9 < total) {
          throw new DomainError("INSUFFICIENT_FUNDS", "saldo_insuficiente");
        }
        state.cash = Math.round((state.cash - total) * 100) / 100;
        const current = state.positions.get(input.symbol);
        const priceClp = Math.round(input.priceUsd * input.usdclp * 100) / 100;
        const nextShares = (current?.shares ?? 0) + input.shares;
        const avgUsd =
          Math.round(
            (((current?.shares ?? 0) * (current?.avgUsd ?? input.priceUsd) + input.shares * input.priceUsd) /
              nextShares) *
              1_000_000,
          ) / 1_000_000;
        const avgClp =
          Math.round(
            (((current?.shares ?? 0) * (current?.avgClp ?? priceClp) + input.shares * priceClp) / nextShares) * 100,
          ) / 100;
        state.positions.set(input.symbol, { shares: nextShares, avgUsd, avgClp });
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
        totalClp: total,
        createdAt: new Date().toISOString(),
      });
      return { cashClp: state.cash, totalClp: total, priceClp: 0 };
    },
    async runReset() {
      state.cash = 1000000;
      state.positions.clear();
      state.orders.length = 0;
      return { cashClp: state.cash, resetCount: 1 };
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
  return { cash: 1000000, positions: new Map(), orders: [], seq: 0 };
}

const USER = "11111111-1111-4111-8111-111111111111";
const PUBKEY = "x".repeat(32);

describe("servicio demo por usuario", () => {
  it("compra ok y actualiza el promedio", async () => {
    const service = createDemoUserService(fakeDeps(freshState()));
    const quote = await service.trade.quote(USER, {
      side: "buy",
      symbol: "AAPLx",
      amount: 950000,
      amountCurrency: "CLP",
    });
    expect(quote.outAmountUi).toBeCloseTo(10, 6);
    const built = await service.trade.build(USER, { quoteId: quote.id, userPublicKey: PUBKEY });
    const submitted = await service.trade.submit(USER, {
      requestId: built.requestId,
      signedTransactionBase64: "c2lnbmVk",
    });
    expect(submitted.status).toBe("confirmed");

    const portfolio = await service.getPortfolio(USER);
    expect(portfolio.positions).toHaveLength(1);
    expect(portfolio.positions[0]?.shares).toBeCloseTo(10, 6);
    expect(portfolio.positions[0]?.avgCostUsd).toBeCloseTo(100, 6);
    expect(portfolio.cashUsdc).toBeCloseTo(50000 / 950, 4);
  });

  it("compra sin saldo -> INSUFFICIENT_FUNDS", async () => {
    const state = freshState();
    state.cash = 1000;
    const service = createDemoUserService(fakeDeps(state));
    await expect(
      service.trade.quote(USER, { side: "buy", symbol: "AAPLx", amount: 950000, amountCurrency: "CLP" }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });

  it("venta sin acciones -> INSUFFICIENT_FUNDS", async () => {
    const service = createDemoUserService(fakeDeps(freshState()));
    await expect(
      service.trade.quote(USER, { side: "sell", symbol: "AAPLx", amount: 1, amountCurrency: "SHARES" }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });

  it("sin dólar -> rechazo claro, sin inventar", async () => {
    const service = createDemoUserService(
      fakeDeps(freshState(), {
        async getFx() {
          throw new DomainError("UPSTREAM", "Dólar no disponible");
        },
      }),
    );
    const error = await service.trade
      .quote(USER, { side: "buy", symbol: "AAPLx", amount: 10000, amountCurrency: "CLP" })
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe("UPSTREAM");
  });

  it("reset vuelve al inicial", async () => {
    const state = freshState();
    state.cash = 50000;
    const service = createDemoUserService(fakeDeps(state));
    const result = await service.reset(USER);
    expect(result.cashClp).toBe(1000000);
  });
});
