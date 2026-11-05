import { readFileSync } from "node:fs";
import path from "node:path";

import {
  Keypair,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReconcileOrderPatch, ReconcileRow } from "@/lib/services/orders.supabase";

const ROOT = path.resolve(__dirname, "..", "..");
const SITE = "https://maverlang.test";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const AAPL_MINT = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
const NOW = new Date("2026-11-03T15:00:00.000Z");
const NOW_MS = NOW.getTime();

const { portfolio } = vi.hoisted(() => ({
  portfolio: { sendBuild: vi.fn() },
}));

vi.mock("@/lib/services", () => ({
  getServices: () => ({
    auth: {
      getSession: async () => ({ userId: "u-test", walletAddress: "w".repeat(32) }),
    },
    portfolio,
  }),
}));

const MANAGED_ENV = [
  "DATA_MODE",
  "AUTH_MODE",
  "NEXT_PUBLIC_AUTH_MODE",
  "NEXT_PUBLIC_DATA_MODE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "REAL_TRADING_READY",
] as const;

/** M46 encendido y motor live: exactamente el escenario que abría la salida. */
const REAL_READY_LIVE: Record<string, string> = {
  DATA_MODE: "live",
  AUTH_MODE: "supabase",
  NEXT_PUBLIC_AUTH_MODE: "supabase",
  NEXT_PUBLIC_DATA_MODE: "live",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
  NEXT_PUBLIC_SITE_URL: SITE,
  REAL_TRADING_READY: "true",
};

async function withEnv<T>(
  env: Record<string, string | undefined>,
  run: () => Promise<T>,
): Promise<T> {
  const saved = new Map<string, string | undefined>();
  for (const key of MANAGED_ENV) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
  try {
    return await run();
  } finally {
    for (const key of MANAGED_ENV) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  }
}

function sendRequest(): Request {
  return new Request(`${SITE}/api/wallet/send/build`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SITE },
    body: JSON.stringify({
      to: "d".repeat(32),
      mint: USDC_MINT,
      amountUi: 1,
      userPublicKey: "w".repeat(32),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// D-01 — la salida pasa por REAL_EXECUTION_LOCKED y por el kill switch
// ---------------------------------------------------------------------------

describe("D-01: POST /api/wallet/send/build detrás del candado y del kill switch", () => {
  it("con REAL_EXECUTION_LOCKED=true responde 503 REAL_DISABLED aunque REAL_TRADING_READY=true y DATA_MODE=live", async () => {
    const response = await withEnv(REAL_READY_LIVE, async () => {
      const { POST } = await import("@/app/api/wallet/send/build/route");
      return POST(sendRequest());
    });

    expect(response.status).toBe(503);
    const payload = (await response.json()) as { error?: { code?: string } };
    expect(payload.error?.code).toBe("REAL_DISABLED");
    // No se tocó el motor de envío: no se armó ninguna transacción.
    expect(portfolio.sendBuild).not.toHaveBeenCalled();
  });

  it("la ruta nombra el candado y el kill switch antes de armar", () => {
    const source = readFileSync(path.join(ROOT, "app/api/wallet/send/build/route.ts"), "utf8");
    expect(source).toContain("assertRealExecutionLocked(");
    expect(source).toContain("assertRealWithdrawalsEnabled(");
    // M46 sigue primero: sin REAL_TRADING_READY nada se ejecuta igual.
    expect(source.indexOf("assertRealTradingEnabled(")).toBeLessThan(
      source.indexOf("assertRealExecutionLocked("),
    );
    // Ambos guardias van ANTES de armar la transacción y del tope.
    expect(source.indexOf("assertRealExecutionLocked(")).toBeLessThan(
      source.indexOf("services.portfolio.sendBuild("),
    );
    expect(source.indexOf("assertRealWithdrawalsEnabled(")).toBeLessThan(
      source.indexOf("services.portfolio.sendBuild("),
    );
    expect(source).toContain("assertSendWithinOperationLimit(");
  });

  it("el panel y el código usan la misma clave: withdrawals_enabled", async () => {
    const { ADMIN_FLAGS } = await import("@/lib/flags");
    const keys = ADMIN_FLAGS.map((flag) => flag.key);
    expect(keys).toContain("withdrawals_enabled");
    expect(keys).not.toContain("offramp_enabled");
    const offramp = ADMIN_FLAGS.find((flag) => flag.key === "withdrawals_enabled");
    expect(offramp?.label).toBe("Salida de dinero");

    const limits = readFileSync(path.join(ROOT, "lib/trade/limits.ts"), "utf8");
    expect(limits).toMatch(/readSwitch\("withdrawals_enabled"/);
  });

  it("el guard real lee el flag con la lista blanca de admin (mismo key que el panel)", async () => {
    const { __resetFlagsForTests, __setFlagReaderForTests } = await import("@/lib/flags");
    const { assertWithdrawalsEnabled, __resetKillSwitchesForTests } = await import("@/lib/trade/limits");
    const { realWithdrawalGuardDeps } = await import("@/lib/trade/real-guards");

    __setFlagReaderForTests(async (key) => key === "withdrawals_enabled");
    __resetKillSwitchesForTests();
    try {
      await expect(assertWithdrawalsEnabled(realWithdrawalGuardDeps())).resolves.toBeUndefined();
    } finally {
      __resetFlagsForTests();
    }

    __setFlagReaderForTests(async (key) => (key === "offramp_enabled" ? true : false));
    __resetKillSwitchesForTests();
    try {
      await expect(assertWithdrawalsEnabled(realWithdrawalGuardDeps())).rejects.toMatchObject({
        code: "REAL_DISABLED",
      });
    } finally {
      __resetFlagsForTests();
      __resetKillSwitchesForTests();
    }
  });

  it("topes de salida: USDC 1:1, acción por precio y rechazo cuando no hay precio", async () => {
    const {
      WITHDRAWAL_MAX_USD_PER_OPERATION,
      assertSendWithinOperationLimit,
      sendNotionalUsd,
      withdrawalMaxUsdPerOperation,
    } = await import("@/lib/wallet/withdrawals");

    expect(sendNotionalUsd({ mint: USDC_MINT, amountUi: 250 })).toBe(250);
    expect(sendNotionalUsd({ mint: AAPL_MINT, amountUi: 2, priceUsd: 250 })).toBe(500);
    expect(sendNotionalUsd({ mint: AAPL_MINT, amountUi: 2 })).toBeNull();
    expect(sendNotionalUsd({ mint: USDC_MINT, amountUi: 0 })).toBeNull();

    expect(() => assertSendWithinOperationLimit(499.99)).not.toThrow();
    expect(() => assertSendWithinOperationLimit(500)).not.toThrow();
    expect(() => assertSendWithinOperationLimit(500.01)).toThrowError(/tope por salida/i);
    expect(() => assertSendWithinOperationLimit(null)).toThrowError(/no pudimos valorar/i);

    // El env sólo puede bajar el tope duro.
    vi.stubEnv("WITHDRAWALS_MAX_USD_PER_OPERATION", "50");
    expect(withdrawalMaxUsdPerOperation()).toBe(50);
    vi.stubEnv("WITHDRAWALS_MAX_USD_PER_OPERATION", "1000000");
    expect(withdrawalMaxUsdPerOperation()).toBe(WITHDRAWAL_MAX_USD_PER_OPERATION);
    vi.unstubAllEnvs();
  });
});

// ---------------------------------------------------------------------------
// D-06 — una sola reserva activa por usuario
// ---------------------------------------------------------------------------

type FakeRow = {
  userId: string;
  requestId: string;
  amountUsd: number;
  status: "reserved" | "consumed" | "released";
  expiresAt: string;
};

function reservationStore(initial: FakeRow[] = []) {
  const rows = [...initial];
  const store = {
    rows,
    async reserve(input: { userId: string; requestId: string; amountUsd: number; expiresAt: string }) {
      rows.push({ ...input, status: "reserved" as const });
      return {
        id: `res-${rows.length}`,
        amountUsd: input.amountUsd,
        expiresAt: input.expiresAt,
        status: "reserved" as const,
      };
    },
    async consume(userId: string, requestId: string) {
      const row = rows.find(
        (item) => item.userId === userId && item.requestId === requestId && item.status === "reserved",
      );
      if (!row) return false;
      row.status = "consumed";
      return true;
    },
    async release(userId: string, requestId: string) {
      const row = rows.find((item) => item.userId === userId && item.requestId === requestId);
      if (!row || row.status !== "reserved") return false;
      row.status = "released";
      return true;
    },
    async read(userId: string, requestId: string) {
      const row = rows.find((item) => item.userId === userId && item.requestId === requestId);
      return row ? { id: `res-${row.requestId}`, amountUsd: row.amountUsd, expiresAt: row.expiresAt, status: row.status } : null;
    },
    async releaseOthers(userId: string, keepRequestId: string) {
      let released = 0;
      for (const row of rows) {
        if (row.userId !== userId) continue;
        if (row.status !== "reserved") continue;
        if (row.requestId === keepRequestId) continue;
        row.status = "released";
        released += 1;
      }
      return released;
    },
  };
  return store;
}

describe("D-06: cotizar no acumula reservas", () => {
  it("tres cotizaciones seguidas dejan UNA sola reserva activa con el último monto", async () => {
    const { reserveOrThrow } = await import("@/lib/trade/reservations");
    const store = reservationStore();

    for (const amountUsd of [100, 150, 200]) {
      await reserveOrThrow(
        store,
        {
          userId: "u-1",
          requestId: `q-${amountUsd}`,
          amountUsd,
          expiresAt: new Date(NOW_MS + 60_000).toISOString(),
        },
        NOW,
      );
    }

    const active = store.rows.filter((row) => row.userId === "u-1" && row.status === "reserved");
    expect(active).toHaveLength(1);
    expect(active[0]?.requestId).toBe("q-200");
    expect(active[0]?.amountUsd).toBe(200);
    // El historial no se borra: las anteriores quedaron `released`.
    expect(store.rows.filter((row) => row.status === "released")).toHaveLength(2);
  });

  it("no toca las reservas consumidas ni las de otros usuarios", async () => {
    const { reserveOrThrow } = await import("@/lib/trade/reservations");
    const store = reservationStore([
      {
        userId: "u-1",
        requestId: "ejecutando",
        amountUsd: 300,
        status: "consumed",
        expiresAt: new Date(NOW_MS + 60_000).toISOString(),
      },
      {
        userId: "u-2",
        requestId: "ajena",
        amountUsd: 100,
        status: "reserved",
        expiresAt: new Date(NOW_MS + 60_000).toISOString(),
      },
    ]);

    await reserveOrThrow(
      store,
      {
        userId: "u-1",
        requestId: "q-1",
        amountUsd: 50,
        expiresAt: new Date(NOW_MS + 60_000).toISOString(),
      },
      NOW,
    );

    expect(store.rows.find((row) => row.requestId === "ejecutando")?.status).toBe("consumed");
    expect(store.rows.find((row) => row.requestId === "ajena")?.status).toBe("reserved");
  });

  it("releaseOtherReservations no rompe si el store no lo soporta o falla", async () => {
    const { releaseOtherReservations, reserveOrThrow } = await import("@/lib/trade/reservations");
    const minimalStore = {
      async reserve(input: { amountUsd: number; expiresAt: string }) {
        return { id: "res-1", amountUsd: input.amountUsd, expiresAt: input.expiresAt, status: "reserved" as const };
      },
      async consume() {
        return true;
      },
      async release() {
        return true;
      },
      async read() {
        return null;
      },
    };
    await expect(releaseOtherReservations(minimalStore, "u-1")).resolves.toBe(0);

    const broken = { ...minimalStore, async releaseOthers() { throw new Error("db down"); } };
    await expect(releaseOtherReservations(broken, "u-1")).resolves.toBe(0);

    // La reserva sigue funcionando aunque la liberación previa falle.
    await expect(
      reserveOrThrow(
        { ...broken, releaseOthers: async () => { throw new Error("db down"); } },
        {
          userId: "u-1",
          requestId: "q-1",
          amountUsd: 10,
          expiresAt: new Date(NOW_MS + 60_000).toISOString(),
        },
        NOW,
      ),
    ).resolves.toMatchObject({ status: "reserved" });
  });

  it("0042 libera las reservas previas dentro de la transacción y prohíbe dos activas", () => {
    const sql = readFileSync(path.join(ROOT, "supabase/migrations/0042_trade_reservations.sql"), "utf8");

    expect(sql).toMatch(/create or replace function public\.release_other_trade_reservations/i);
    expect(sql).toMatch(/perform public\.release_other_trade_reservations\(p_user_id, v_request_id\)/i);
    // La liberación ocurre ANTES de sumar las reservas activas del usuario.
    expect(sql.indexOf("release_other_trade_reservations(p_user_id, v_request_id)")).toBeLessThan(
      sql.indexOf("into v_reserved"),
    );
    // Sólo `reserved`: una reserva consumida representa una ejecución en curso.
    const releaseFn = sql.slice(
      sql.indexOf("create or replace function public.release_other_trade_reservations"),
      sql.indexOf("grant execute on function public.release_other_trade_reservations"),
    );
    expect(releaseFn).toMatch(/and status = 'reserved'/i);
    expect(releaseFn).not.toMatch(/consumed/i);

    expect(sql).toMatch(
      /create unique index if not exists trade_reservations_one_active_idx\s+on public\.trade_reservations \(user_id\)\s+where status = 'reserved'/i,
    );
  });

  it("quote libera la reserva anterior antes de comprobar los topes", () => {
    const quote = readFileSync(path.join(ROOT, "app/api/trade/quote/route.ts"), "utf8");
    expect(quote).toContain("releaseRealTradeReservations(");
    expect(quote.indexOf("releaseRealTradeReservations(")).toBeLessThan(
      quote.indexOf("assertRealTradeAllowed("),
    );
    expect(quote.indexOf("releaseRealTradeReservations(")).toBeLessThan(
      quote.indexOf("reserveRealTradeAmount("),
    );
  });
});

// ---------------------------------------------------------------------------
// D-05 — sin firma no hay evidencia: no se expira ni se libera cupo
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<ReconcileRow> = {}): ReconcileRow {
  return {
    id: overrides.id ?? "ord-1",
    status: overrides.status ?? "pending",
    tx_signature: "tx_signature" in overrides ? (overrides.tx_signature ?? null) : null,
    created_at: overrides.created_at ?? new Date(NOW_MS - 20 * 60_000).toISOString(),
    quote_expires_at: "quote_expires_at" in overrides ? (overrides.quote_expires_at ?? null) : null,
    user_id: overrides.user_id ?? "u-1",
    request_id: overrides.request_id ?? "req-1",
    side: overrides.side,
    in_amount_ui: overrides.in_amount_ui,
    out_amount_ui: overrides.out_amount_ui,
    price_per_share_usd: overrides.price_per_share_usd,
  };
}

describe("D-05: evidencia de firma antes de expirar o liberar cupo", () => {
  it("mayReleaseReservation sólo libera con evidencia de no ejecución", async () => {
    const { mayReleaseReservation } = await import("@/lib/orders/reconcile");
    expect(mayReleaseReservation(makeRow({ tx_signature: "sig" }), { status: "confirmed" })).toBe(false);
    expect(mayReleaseReservation(makeRow({ tx_signature: "sig" }), { status: "expired", error_code: "TX_EXPIRED" })).toBe(true);
    expect(mayReleaseReservation(makeRow({ tx_signature: null }), { status: "expired", error_code: "QUOTE_EXPIRED" })).toBe(false);
    expect(mayReleaseReservation(makeRow({ tx_signature: null }), { status: "failed", error_code: "INVALID_AMOUNT" })).toBe(true);
  });

  it("una orden pending sin firma NO se expira ni libera cupo: queda para revisión", async () => {
    const { reconcilePendingOrders } = await import("@/lib/orders/reconcile");
    const row = makeRow({ id: "o-sin-firma", status: "pending", tx_signature: null });
    let released = 0;
    const applied = new Map<string, ReconcileOrderPatch>();

    const summary = await reconcilePendingOrders({
      now: () => NOW,
      dataMode: () => "live",
      listOpen: async () => [row],
      getSignatureStatuses: async () => [],
      readReservation: async () => ({ amountUsd: 100, status: "consumed", expiresAt: "" }),
      releaseReservation: async () => {
        released += 1;
        return true;
      },
      update: async (id, patch) => {
        applied.set(id, patch);
        return true;
      },
    });

    expect(applied.size).toBe(0);
    expect(released).toBe(0);
    expect(summary.needsReview).toBe(1);
    expect(summary.expired).toBe(0);
    expect(summary.unchanged).toBe(1);
  });

  it("una pending CON firma se concilia on-chain (confirmada) y no libera cupo", async () => {
    const { reconcilePendingOrders } = await import("@/lib/orders/reconcile");
    const row = makeRow({ id: "o-firmada", status: "pending", tx_signature: "sig-ok" });
    let released = 0;
    const applied = new Map<string, ReconcileOrderPatch>();

    const summary = await reconcilePendingOrders({
      now: () => NOW,
      dataMode: () => "live",
      listOpen: async () => [row],
      getSignatureStatuses: async () => [{ status: "confirmed", err: null }],
      readReservation: async () => ({ amountUsd: 100, status: "consumed", expiresAt: "" }),
      releaseReservation: async () => {
        released += 1;
        return true;
      },
      update: async (id, patch) => {
        applied.set(id, patch);
        return true;
      },
    });

    expect(summary.confirmed).toBe(1);
    expect(applied.get("o-firmada")?.status).toBe("confirmed");
    expect(released).toBe(0);
  });

  it("una pending CON firma que no está en la cadena sí expira y libera cupo", async () => {
    const { reconcilePendingOrders } = await import("@/lib/orders/reconcile");
    const row = makeRow({ id: "o-perdida", status: "pending", tx_signature: "sig-nunca" });
    let released = 0;
    const applied = new Map<string, ReconcileOrderPatch>();

    const summary = await reconcilePendingOrders({
      now: () => NOW,
      dataMode: () => "live",
      listOpen: async () => [row],
      getSignatureStatuses: async () => [null],
      readReservation: async () => ({ amountUsd: 100, status: "consumed", expiresAt: "" }),
      releaseReservation: async () => {
        released += 1;
        return true;
      },
      update: async (id, patch) => {
        applied.set(id, patch);
        return true;
      },
    });

    expect(summary.expired).toBe(1);
    expect(applied.get("o-perdida")?.error_code).toBe("TX_EXPIRED");
    expect(released).toBe(1);
  });

  it("la firma se deriva de la tx firmada por el cliente", async () => {
    const { readTransactionSignature } = await import("@/lib/trade/integrity");
    const { decodeBase58, encodeBase58 } = await import("@/lib/solana/address");

    const payer = Keypair.fromSeed(new Uint8Array(32).fill(7));
    const destination = Keypair.fromSeed(new Uint8Array(32).fill(9)).publicKey;
    const message = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N",
      instructions: [
        SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: destination, lamports: 1 }),
      ],
    }).compileToV0Message();

    const unsigned = new VersionedTransaction(message);
    expect(await readTransactionSignature(Buffer.from(unsigned.serialize()).toString("base64"))).toBeNull();

    const signed = new VersionedTransaction(message);
    signed.sign([payer]);
    const signature = await readTransactionSignature(Buffer.from(signed.serialize()).toString("base64"));

    expect(signature).toBe(encodeBase58(signed.signatures[0] as Uint8Array));
    expect(decodeBase58(signature as string)).toHaveLength(64);
  });

  it("submit guarda la firma en el reclamo y finalize no la borra", () => {
    const trade = readFileSync(path.join(ROOT, "lib/services/trade.live.ts"), "utf8");
    expect(trade).toContain("readTransactionSignature(signedTransactionBase64)");
    expect(trade.indexOf("readTransactionSignature(")).toBeLessThan(
      trade.indexOf("await claimOrderExecution("),
    );
    expect(trade).toContain("signature: signedSignature");

    const orders = readFileSync(path.join(ROOT, "lib/services/orders.supabase.ts"), "utf8");
    const claim = orders.slice(orders.indexOf("export async function claimOrderExecution"));
    expect(claim).toMatch(/signature: row\.signature \?\? null/);
    expect(claim).toMatch(/tx_signature: row\.signature \?\? null/);
    const finalize = orders.slice(orders.indexOf("export async function finalizeOrderExecution"));
    expect(finalize).toMatch(/if \(outcome\.signature\)/);
  });
});
