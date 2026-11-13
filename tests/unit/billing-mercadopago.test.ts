import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mercado Pago (§1.4, §1.11): firma `x-signature`, idempotencia del webhook y
 * checkout cerrado con el cobro apagado. Sin red y sin secretos reales: el
 * secreto es de prueba y el cliente de Supabase es un doble en memoria.
 */

const state = vi.hoisted(() => ({
  events: [] as Array<Record<string, unknown>>,
  subscriptions: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/supabase/admin", () => {
  type Row = Record<string, unknown>;
  type DbResult = {
    data: Row | Row[] | null;
    error: { code: string; message: string } | null;
  };

  const eventKey = (row: Row): string =>
    `${String(row.provider ?? "mercadopago")}:${String(
      row.provider_event_id ?? row.providerEventId ?? row.eventId ?? "",
    )}`;

  function apply(table: string, ops: Array<{ op: string; args: unknown[] }>): DbResult {
    if (table === "app_flags") return { data: null, error: null };
    const write = ops.find((op) => op.op === "insert" || op.op === "upsert");
    if (table === "billing_events") {
      if (!write) return { data: [...state.events], error: null };
      const raw = write.args[0];
      const row = (Array.isArray(raw) ? raw[0] : raw) as Row;
      const key = eventKey(row);
      if (state.events.some((event) => eventKey(event) === key)) {
        return {
          data: null,
          error: {
            code: "23505",
            message: "duplicate key value violates unique constraint",
          },
        };
      }
      state.events.push(row);
      return { data: [{ id: `event-row-${state.events.length}` }], error: null };
    }
    if (table === "copy_subscriptions") {
      if (!write) return { data: [...state.subscriptions], error: null };
      const raw = write.args[0];
      const row = (Array.isArray(raw) ? raw[0] : raw) as Row;
      const index = state.subscriptions.findIndex((item) => item.user_id === row.user_id);
      if (index >= 0) state.subscriptions[index] = { ...state.subscriptions[index], ...row };
      else state.subscriptions.push(row);
      return { data: [row], error: null };
    }
    return { data: null, error: null };
  }

  function builder(table: string) {
    const ops: Array<{ op: string; args: unknown[] }> = [];
    const chain: Record<string, unknown> = {};
    for (const op of [
      "select",
      "insert",
      "upsert",
      "update",
      "delete",
      "eq",
      "in",
      "limit",
      "order",
    ]) {
      chain[op] = (...args: unknown[]) => {
        ops.push({ op, args });
        return chain;
      };
    }
    chain.maybeSingle = async () => {
      const result = apply(table, ops);
      return {
        data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
        error: result.error,
      };
    };
    chain.single = async () => {
      const result = apply(table, ops);
      return {
        data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
        error: result.error,
      };
    };
    chain.then = (
      resolve: (value: DbResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(apply(table, ops)).then(resolve, reject);
    return chain;
  }

  return {
    createSupabaseAdminClient: () => ({ from: (table: string) => builder(table) }),
  };
});

vi.mock("@/lib/security/rate-limit", () => ({
  // Sin memoria ni Redis: el foco es el candado del cobro, no el cupo.
  withRateLimit: async () => null,
}));

import { recordBillingEvent } from "@/lib/billing/store";
import { mercadoPagoProvider } from "@/lib/billing/mercadopago";
import { __resetFlagsForTests } from "@/lib/flags";

const WEBHOOK_SECRET = "solo-test-webhook-secret";
const TS = "1700000000";
const DATA_ID = "123456";
const REQUEST_ID = "req-test-1";

function signatureHeader(secret: string, overrides: Partial<{ ts: string; dataId: string; requestId: string }> = {}) {
  const ts = overrides.ts ?? TS;
  const dataId = overrides.dataId ?? DATA_ID;
  const requestId = overrides.requestId ?? REQUEST_ID;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", secret).update(manifest, "utf8").digest("hex");
  return { header: `ts=${ts},v1=${v1}`, requestId };
}

beforeEach(() => {
  state.events.length = 0;
  state.subscriptions.length = 0;
  process.env.MERCADOPAGO_WEBHOOK_SECRET = WEBHOOK_SECRET;
  delete process.env.COPY_BILLING_READY;
  __resetFlagsForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
  delete process.env.COPY_BILLING_READY;
  __resetFlagsForTests();
});

describe("mercadopago: firma x-signature", () => {
  it("acepta la firma HMAC-SHA256 correcta", () => {
    const { header, requestId } = signatureHeader(WEBHOOK_SECRET);
    const headers = new Headers({ "x-signature": header, "x-request-id": requestId });
    expect(mercadoPagoProvider.verifyWebhook({ headers, dataId: DATA_ID })).toEqual({ valid: true });
  });

  it("rechaza una firma con otro v1", () => {
    const { header, requestId } = signatureHeader(WEBHOOK_SECRET);
    const wrong = header.replace(/v1=[0-9a-f]+/i, `v1=${"0".repeat(64)}`);
    const headers = new Headers({ "x-signature": wrong, "x-request-id": requestId });
    expect(mercadoPagoProvider.verifyWebhook({ headers, dataId: DATA_ID })).toEqual({
      valid: false,
      reason: "invalid_signature",
    });
  });

  it("rechaza si cambia el data.id, el request-id o el ts", () => {
    const { header, requestId } = signatureHeader(WEBHOOK_SECRET);
    expect(
      mercadoPagoProvider.verifyWebhook({
        headers: new Headers({ "x-signature": header, "x-request-id": requestId }),
        dataId: "999999",
      }),
    ).toEqual({ valid: false, reason: "invalid_signature" });
    expect(
      mercadoPagoProvider.verifyWebhook({
        headers: new Headers({ "x-signature": header, "x-request-id": "otro-request" }),
        dataId: DATA_ID,
      }),
    ).toEqual({ valid: false, reason: "invalid_signature" });
    expect(
      mercadoPagoProvider.verifyWebhook({
        headers: new Headers({ "x-signature": header, "x-request-id": requestId }),
        dataId: DATA_ID,
      }),
    ).toEqual({ valid: true });
  });

  it("sin firma, malformada o sin secreto no valida", () => {
    expect(
      mercadoPagoProvider.verifyWebhook({ headers: new Headers(), dataId: DATA_ID }),
    ).toEqual({ valid: false, reason: "missing_signature" });
    expect(
      mercadoPagoProvider.verifyWebhook({
        headers: new Headers({ "x-signature": "ts=123,v1=no-es-hex" }),
        dataId: DATA_ID,
      }),
    ).toEqual({ valid: false, reason: "malformed_signature" });
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    expect(
      mercadoPagoProvider.verifyWebhook({ headers: new Headers(), dataId: DATA_ID }),
    ).toEqual({ valid: false, reason: "missing_secret" });
  });
});

describe("billing_events: idempotencia", () => {
  it("el mismo provider_event_id se registra una sola vez", async () => {
    const event = {
      provider: "mercadopago",
      eventId: "evt-repetido-1",
      type: "subscription_preapproval",
      payloadHash: "a".repeat(64),
    };

    const first = await recordBillingEvent(event);
    const second = await recordBillingEvent(event);

    expect(first.failed).toBe(false);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.failed).toBe(false);
    expect(state.events).toHaveLength(1);
  });

  it("un evento distinto sí se registra", async () => {
    const base = {
      provider: "mercadopago",
      type: "subscription_preapproval",
      payloadHash: "b".repeat(64),
    };
    await recordBillingEvent({ ...base, eventId: "evt-a" });
    await recordBillingEvent({ ...base, eventId: "evt-b" });
    expect(state.events).toHaveLength(2);
  });
});

describe("checkout: 403 con el cobro apagado", () => {
  it("responde FEATURE_DISABLED sin sesión y sin llamar a Mercado Pago", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("no debe llamarse a Mercado Pago con el cobro apagado");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { POST } = await import("@/app/api/billing/checkout/route");
    const request = new Request("https://maverlang.test/api/billing/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://maverlang.test",
      },
      body: JSON.stringify({ plan: "monthly" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    const body = (await response.json()) as { ok?: boolean; error?: { code?: string } };
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("FEATURE_DISABLED");
    expect(fetchSpy).not.toHaveBeenCalled();
  }, 60_000);
});
