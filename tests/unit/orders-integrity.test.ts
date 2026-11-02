import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  inserts: [] as Array<Record<string, unknown>>,
  filters: [] as string[],
}));

vi.mock("@/lib/supabase/admin", () => {
  type Chain = {
    insert: (payload: Record<string, unknown>) => Chain;
    select: () => Chain;
    single: () => Promise<{ data: unknown; error: unknown }>;
    eq: (column: string, value: unknown) => Chain;
    order: () => Chain;
    limit: () => Promise<{ data: unknown[]; error: unknown }>;
    maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  };
  const chain: Chain = {
    insert: (payload) => {
      state.inserts.push(payload);
      return chain;
    },
    select: () => chain,
    single: () =>
      Promise.resolve({ data: { id: "order-1", status: "pending", signature: null }, error: null }),
    eq: (column, value) => {
      state.filters.push(`${column}=${String(value)}`);
      return chain;
    },
    order: () => chain,
    limit: () => Promise.resolve({ data: [], error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return { createSupabaseAdminClient: () => ({ from: () => chain }) };
});

import { claimOrderExecution, listOrdersForLimits } from "@/lib/services/orders.supabase";

beforeEach(() => {
  state.inserts.length = 0;
  state.filters.length = 0;
});

describe("Auditoría 2026-11: integridad de `orders`", () => {
  it("el reclamo registra el notional validado y marca la orden como real", async () => {
    const claim = await claimOrderExecution({
      userId: "u-1",
      requestId: "req-1",
      side: "buy",
      symbol: "AAPLx",
      mint: "mint",
      inAmountUi: 100,
      outAmountUi: 0.4,
      priceUsd: 250,
      feeBps: 0,
      feeUsd: 0,
      notionalUsd: 100,
      quoteExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(claim).toEqual({
      id: "order-1",
      status: "pending",
      signature: null,
      claimed: true,
    });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      user_id: "u-1",
      request_id: "req-1",
      notional_usd: 100,
      status: "pending",
      is_demo: false,
      signature: null,
      tx_signature: null,
    });
  });

  it("los topes sólo suman órdenes reales (`is_demo = false`)", async () => {
    await listOrdersForLimits("u-1");
    expect(state.filters).toContain("is_demo=false");
    expect(state.filters).toContain("user_id=u-1");
  });
});
