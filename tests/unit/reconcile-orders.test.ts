import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/cron/reconcile-orders/route";
import {
  decideSubmitted,
  pendingQuoteExpired,
  reconcilePendingOrders,
} from "@/lib/orders/reconcile";
import type { ReconcileOrderPatch, ReconcileRow } from "@/lib/services/orders.supabase";

const NOW = new Date("2026-10-17T15:00:00.000Z");
const NOW_MS = NOW.getTime();

function makeRow(overrides: Partial<ReconcileRow> = {}): ReconcileRow {
  return {
    id: overrides.id ?? "ord-1",
    status: overrides.status ?? "submitted",
    tx_signature: "tx_signature" in overrides ? (overrides.tx_signature ?? null) : "sig-1",
    created_at: overrides.created_at ?? new Date(NOW_MS - 5 * 60_000).toISOString(),
    quote_expires_at: "quote_expires_at" in overrides ? (overrides.quote_expires_at ?? null) : null,
  };
}

describe("M72: pendingQuoteExpired y decideSubmitted", () => {
  it("pendingQuoteExpired detecta orden pending vencida por antigüedad (> 15 min)", () => {
    const oldRow = makeRow({
      status: "pending",
      tx_signature: null,
      created_at: new Date(NOW_MS - 16 * 60_000).toISOString(),
    });
    expect(pendingQuoteExpired(oldRow, NOW_MS, 15)).toBe(true);
  });

  it("pendingQuoteExpired detecta orden pending vencida por quote_expires_at", () => {
    const row = makeRow({
      status: "pending",
      tx_signature: null,
      created_at: new Date(NOW_MS - 2 * 60_000).toISOString(),
      quote_expires_at: new Date(NOW_MS - 1_000).toISOString(),
    });
    expect(pendingQuoteExpired(row, NOW_MS, 15)).toBe(true);
  });

  it("decideSubmitted confirma orden submitted cuando el estado on-chain es confirmed o finalized sin error", () => {
    const row = makeRow();
    const patch = decideSubmitted(row, { status: "confirmed", err: null }, NOW_MS, 15);
    expect(patch).toEqual({
      status: "confirmed",
      confirmed_at: NOW.toISOString(),
    });
  });

  it("decideSubmitted marca failed con mensaje traducido cuando la tx tiene err on-chain", () => {
    const row = makeRow();
    const patch = decideSubmitted(row, { status: "confirmed", err: "Error: 6001 slippage tolerance exceeded" }, NOW_MS, 15);
    expect(patch?.status).toBe("failed");
    expect(patch?.error_code).toBe("SLIPPAGE_EXCEEDED");
    expect(patch?.error).toContain("El precio se movió");
  });

  it("decideSubmitted marca expired con TX_EXPIRED cuando la firma no existe y superó el límite de tiempo", () => {
    const oldSubmitted = makeRow({
      created_at: new Date(NOW_MS - 20 * 60_000).toISOString(),
    });
    const patch = decideSubmitted(oldSubmitted, null, NOW_MS, 15);
    expect(patch).toEqual({ status: "expired", error_code: "TX_EXPIRED" });
  });
});

describe("M72: reconcilePendingOrders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("en DATA_MODE=mock sin deps inyectadas devuelve ceros sin tocar red", async () => {
    vi.stubEnv("DATA_MODE", "mock");
    const summary = await reconcilePendingOrders();
    expect(summary).toEqual({
      ok: true,
      mode: "mock",
      scanned: 0,
      confirmed: 0,
      failed: 0,
      expired: 0,
      unchanged: 0,
      durationMs: 0,
    });
  });

  it("concilia lote mixto (confirmed, failed, expired y unchanged) de forma idempotente", async () => {
    const rows: ReconcileRow[] = [
      makeRow({ id: "o-confirm", status: "submitted", tx_signature: "sig-ok" }),
      makeRow({ id: "o-fail", status: "submitted", tx_signature: "sig-err" }),
      makeRow({
        id: "o-expire-tx",
        status: "submitted",
        tx_signature: "sig-missing",
        created_at: new Date(NOW_MS - 20 * 60_000).toISOString(),
      }),
      makeRow({
        id: "o-expire-quote",
        status: "pending",
        tx_signature: null,
        created_at: new Date(NOW_MS - 20 * 60_000).toISOString(),
      }),
      makeRow({
        id: "o-fresh-pending",
        status: "pending",
        tx_signature: null,
        created_at: new Date(NOW_MS - 2 * 60_000).toISOString(),
      }),
    ];
    const applied = new Map<string, ReconcileOrderPatch>();

    const summary = await reconcilePendingOrders({
      now: () => NOW,
      dataMode: () => "live",
      listOpen: async () => rows,
      getSignatureStatuses: async (sigs) =>
        sigs.map((s) => {
          if (s === "sig-ok") return { status: "finalized", err: null };
          if (s === "sig-err") return { status: "confirmed", err: "custom program error: 0x1" };
          return null;
        }),
      update: async (id, patch) => {
        if (applied.has(id)) return false;
        applied.set(id, patch);
        return true;
      },
    });

    expect(summary.ok).toBe(true);
    expect(summary.scanned).toBe(5);
    expect(summary.confirmed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.expired).toBe(2);
    expect(summary.unchanged).toBe(1);
    expect(applied.get("o-confirm")?.status).toBe("confirmed");
    expect(applied.get("o-fail")?.error_code).toBe("INSUFFICIENT_FUNDS");
    expect(applied.get("o-expire-tx")?.error_code).toBe("TX_EXPIRED");
    expect(applied.get("o-expire-quote")?.error_code).toBe("QUOTE_EXPIRED");
  });
});

describe("M72: endpoint /api/cron/reconcile-orders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("devuelve 503 REAL_DISABLED cuando CRON_SECRET no está configurado", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(new Request("http://localhost:3100/api/cron/reconcile-orders"));
    expect(res.status).toBe(503);
  });

  it("devuelve 401 UNAUTHORIZED cuando el token Bearer es inválido o falta", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-test-m72");
    const res = await GET(
      new Request("http://localhost:3100/api/cron/reconcile-orders", {
        headers: { authorization: "Bearer wrong-token" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("devuelve 200 con Cache-Control: no-store en GET y POST autenticados en modo mock", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-test-m72");
    vi.stubEnv("DATA_MODE", "mock");
    const req = () =>
      new Request("http://localhost:3100/api/cron/reconcile-orders", {
        headers: { authorization: "Bearer cron-secret-test-m72" },
      });
    const resGet = await GET(req());
    expect(resGet.status).toBe(200);
    expect(resGet.headers.get("cache-control")).toContain("no-store");
    const bodyGet = await resGet.json();
    expect(bodyGet).toMatchObject({ ok: true, data: { ok: true, mode: "mock", scanned: 0 } });

    const resPost = await POST(req());
    expect(resPost.status).toBe(200);
  });
});
