import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LIMIT_ORDERS_STORAGE_KEY,
  addDcaPlan,
  addLimitOrder,
  cancelLimitOrder,
  clearLimitOrdersStore,
  readLimitOrdersSnapshot,
  removeDcaPlan,
  toggleDcaPlan,
} from "@/lib/trade/limit-orders-store";

describe("limit-orders-store", () => {
  beforeEach(() => {
    clearLimitOrdersStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearLimitOrdersStore();
  });

  it("crea y cancela órdenes límite correctamente", () => {
    const order = addLimitOrder({
      symbol: "NVDAX",
      name: "NVIDIA",
      side: "buy",
      amountUsd: 100,
      targetPriceUsd: 125.5,
      expiry: "7d",
    });

    expect(order.id).toMatch(/^lim_/);
    expect(order.status).toBe("active");
    expect(order.symbol).toBe("NVDAX");
    expect(order.targetPriceUsd).toBe(125.5);

    const snapAfterAdd = readLimitOrdersSnapshot();
    expect(snapAfterAdd.limitOrders).toHaveLength(1);
    expect(snapAfterAdd.limitOrders[0]?.id).toBe(order.id);

    const cancelled = cancelLimitOrder(order.id);
    expect(cancelled?.status).toBe("cancelled");
    expect(readLimitOrdersSnapshot().limitOrders[0]?.status).toBe("cancelled");

    expect(cancelLimitOrder("lim_inexistente")).toBeNull();
  });

  it("crea, pausa/reanuda y elimina planes Auto-DCA", () => {
    const beforeMs = Date.now();
    const weekly = addDcaPlan({
      symbol: "AAPLX",
      name: "Apple",
      amountUsd: 50,
      frequency: "weekly",
    });
    const monthly = addDcaPlan({
      symbol: "TSLAX",
      name: "Tesla",
      amountUsd: 100,
      frequency: "monthly",
    });

    expect(weekly.id).toMatch(/^dca_/);
    expect(weekly.active).toBe(true);
    const weeklyDiffDays = (Date.parse(weekly.nextRunAt) - beforeMs) / (1000 * 60 * 60 * 24);
    expect(weeklyDiffDays).toBeGreaterThanOrEqual(6.9);
    expect(weeklyDiffDays).toBeLessThanOrEqual(7.1);

    const monthlyDiffDays = (Date.parse(monthly.nextRunAt) - beforeMs) / (1000 * 60 * 60 * 24);
    expect(monthlyDiffDays).toBeGreaterThanOrEqual(29.9);
    expect(monthlyDiffDays).toBeLessThanOrEqual(30.1);

    const paused = toggleDcaPlan(weekly.id);
    expect(paused?.active).toBe(false);

    const resumed = toggleDcaPlan(weekly.id);
    expect(resumed?.active).toBe(true);
    expect(toggleDcaPlan("dca_missing")).toBeNull();

    expect(removeDcaPlan(weekly.id)).toBe(true);
    expect(removeDcaPlan(weekly.id)).toBe(false);
    expect(readLimitOrdersSnapshot().dcaPlans).toHaveLength(1);
    expect(readLimitOrdersSnapshot().dcaPlans[0]?.id).toBe(monthly.id);
  });

  it("persiste en localStorage cuando window está disponible y tolera JSON corrupto", () => {
    const backing = new Map<string, string>();
    const fakeLocalStorage = {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => {
        backing.set(key, value);
      },
      removeItem: (key: string) => {
        backing.delete(key);
      },
    };
    const fakeWindow = {
      localStorage: fakeLocalStorage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("Event", class FakeEvent {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    });

    const created = addLimitOrder({
      symbol: "MSFTX",
      name: "Microsoft",
      side: "sell",
      amountUsd: 250,
      targetPriceUsd: 450,
      expiry: "gtc",
    });

    const raw = backing.get(LIMIT_ORDERS_STORAGE_KEY);
    expect(raw).toBeDefined();
    expect(raw).toContain(created.id);

    backing.set(LIMIT_ORDERS_STORAGE_KEY, "{not-valid-json");
    const fallback = readLimitOrdersSnapshot();
    expect(fallback.limitOrders).toEqual([]);
    expect(fallback.dcaPlans).toEqual([]);
  });
});
