import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  checkLimits,
  countActiveReservations,
  type CountedOrder,
  type CountedReservation,
  type LimitsDeps,
} from "@/lib/trade/limits";
import {
  assertReservationActive,
  assertSubmitReservation,
  consumeOrThrow,
  mapReservationFailure,
  normalizeReservationInput,
  quoteReservationAmount,
  releaseQuietly,
  rekeyOrThrow,
  reservationExpiry,
  reserveOrThrow,
  RESERVATION_MAX_TTL_MS,
  RESERVATION_TTL_MS,
  type ReservationRecord,
  type ReservationStore,
} from "@/lib/trade/reservations";

const ROOT = path.resolve(__dirname, "..", "..");
const NOW = new Date("2026-11-02T15:00:00.000Z");

function record(overrides: Partial<ReservationRecord> = {}): ReservationRecord {
  return {
    id: overrides.id ?? "res-1",
    amountUsd: overrides.amountUsd ?? 100,
    expiresAt: overrides.expiresAt ?? new Date(NOW.getTime() + 60_000).toISOString(),
    status: overrides.status ?? "reserved",
  };
}

type FakeStore = ReservationStore & {
  reserved: Array<{
    userId: string;
    requestId: string;
    amountUsd: number;
    expiresAt: string;
  }>;
  consumed: string[];
  released: string[];
  rekeyed: string[];
  row: ReservationRecord | null;
  reserveResult?: ReservationRecord;
};

function makeStore(initial: ReservationRecord | null = record()): FakeStore {
  const store: FakeStore = {
    reserved: [],
    consumed: [],
    released: [],
    rekeyed: [],
    row: initial,
    async reserve(input) {
      store.reserved.push(input);
      return store.reserveResult ?? record({ amountUsd: input.amountUsd, expiresAt: input.expiresAt });
    },
    async consume(_userId, requestId) {
      store.consumed.push(requestId);
      return store.row?.status === "reserved";
    },
    async release(_userId, requestId) {
      store.released.push(requestId);
      return true;
    },
    async read() {
      return store.row;
    },
    async rekey(_userId, oldId, newId) {
      store.rekeyed.push(`${oldId}->${newId}`);
      return true;
    },
  };
  return store;
}

function makeDeps(
  overrides: Partial<LimitsDeps> & {
    orders?: CountedOrder[];
    reservations?: CountedReservation[];
    globalReservations?: CountedReservation[];
  } = {},
): LimitsDeps {
  return {
    getFlagBool: async (key) => key === "beta_only",
    getFlagValue: async (key) => (key === "global_daily_usd" ? 10_000 : undefined),
    readUserLimits: async () => null,
    isBetaUser: async () => false,
    listOrders: async () => overrides.orders ?? [],
    listOrdersAllUsers: async () => overrides.orders ?? [],
    listReservations: async () => overrides.reservations ?? [],
    listReservationsAllUsers: async () => overrides.globalReservations ?? [],
    now: () => NOW,
    ...overrides,
  };
}

describe("0042: migración de reservas atómicas", () => {
  const sql = readFileSync(
    path.join(ROOT, "supabase", "migrations", "0042_trade_reservations.sql"),
    "utf8",
  );

  it("crea trade_reservations con clave única, estados y vencimiento", () => {
    expect(sql).toMatch(/create table if not exists public\.trade_reservations/i);
    expect(sql).toMatch(/user_id uuid not null references public\.profiles \(id\)/i);
    expect(sql).toMatch(/request_id text not null/i);
    expect(sql).toMatch(/amount_usd numeric\(18,2\) not null check \(amount_usd > 0\)/i);
    expect(sql).toMatch(/status text not null default 'reserved'/i);
    expect(sql).toMatch(/check \(status in \('reserved', 'consumed', 'released'\)\)/i);
    expect(sql).toMatch(/expires_at timestamptz not null/i);
    expect(sql).toMatch(/unique \(user_id, request_id\)/i);
  });

  it("RLS forzada y cero acceso para anon/authenticated", () => {
    expect(sql).toMatch(/alter table public\.trade_reservations enable row level security/i);
    expect(sql).toMatch(/alter table public\.trade_reservations force row level security/i);
    expect(sql).toMatch(
      /revoke all on table public\.trade_reservations from public, anon, authenticated/i,
    );
    expect(sql).not.toMatch(/create policy .*trade_reservations/i);
  });

  it("la reserva es atómica: advisory locks, topes y ventanas Santiago", () => {
    expect(sql).toMatch(/create or replace function public\.reserve_trade_amount/i);
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    expect(sql).toMatch(/hashtextextended\('maverlang:trade:global', 0\)/);
    expect(sql).toMatch(/America\/Santiago/);
    expect(sql).toMatch(/MV_LIMIT_ORDER/);
    expect(sql).toMatch(/MV_LIMIT_DAILY/);
    expect(sql).toMatch(/MV_LIMIT_MONTHLY/);
    expect(sql).toMatch(/MV_LIMIT_GLOBAL/);
    expect(sql).toMatch(/MV_RESERVATION_CONFLICT/);
    expect(sql).toMatch(/MV_RESERVATION_EXPIRED/);
    // Una reserva consumida sin fila de orden sigue reteniendo cupo hasta
    // vencer: cierra la ventana de doble operación.
    expect((sql.match(/status in \('reserved', 'consumed'\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("las funciones no escalan privilegios: SECURITY INVOKER y sólo service_role", () => {
    expect(sql).toMatch(/security invoker/i);
    expect(sql).not.toMatch(/security definer/i);
  });

  it("funciones de consumo, liberación, re-etiquetado y lectura; sólo service_role", () => {
    for (const fn of [
      "consume_trade_reservation",
      "release_trade_reservation",
      "rekey_trade_reservation",
      "read_trade_reservation",
    ]) {
      expect(sql).toMatch(new RegExp(`create or replace function public\\.${fn}`));
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function public\\.${fn}\\([^)]*\\)\\s+from public, anon, authenticated`,
        ),
      );
      expect(sql).toMatch(
        new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\)\\s+to service_role`),
      );
    }
  });

  it("registra el notional de la orden para la conciliación", () => {
    expect(sql).toMatch(/alter table public\.orders\s+add column if not exists notional_usd/i);
    expect(sql).toMatch(/orders_notional_usd_check/i);
    expect(sql).toMatch(/check \(notional_usd is null or notional_usd > 0\)/i);
  });

  it("no usa fechas prohibidas ni habilita dinero real", () => {
    expect(sql).not.toMatch(/pg_catalog\.current_date/i);
    expect(sql).toMatch(/REAL_EXECUTION_LOCKED/);
  });
});

describe("Reservas: vencimiento y monto", () => {
  it("sin cotización usa el TTL por defecto", () => {
    expect(reservationExpiry(null, NOW)).toBe(
      new Date(NOW.getTime() + RESERVATION_TTL_MS).toISOString(),
    );
  });

  it("cubre el vencimiento de la cotización con margen", () => {
    const quoteExpires = new Date(NOW.getTime() + 5 * 60_000).toISOString();
    expect(reservationExpiry(quoteExpires, NOW)).toBe(
      new Date(NOW.getTime() + 5 * 60_000 + 30_000).toISOString(),
    );
  });

  it("nunca supera el tope duro de 10 minutos", () => {
    const quoteExpires = new Date(NOW.getTime() + 60 * 60_000).toISOString();
    expect(reservationExpiry(quoteExpires, NOW)).toBe(
      new Date(NOW.getTime() + RESERVATION_MAX_TTL_MS).toISOString(),
    );
  });

  it("una cotización ya vencida no alarga la reserva", () => {
    const quoteExpires = new Date(NOW.getTime() - 1_000).toISOString();
    expect(reservationExpiry(quoteExpires, NOW)).toBe(
      new Date(NOW.getTime() + RESERVATION_TTL_MS).toISOString(),
    );
  });

  it("notional de reserva: compra entra USDC; venta sale USDC", () => {
    expect(
      quoteReservationAmount({ side: "buy", inAmountUi: 100, outAmountUi: 0.4, pricePerShareUsd: 250 }),
    ).toBe(100);
    expect(
      quoteReservationAmount({ side: "sell", inAmountUi: 0.4, outAmountUi: 98, pricePerShareUsd: 250 }),
    ).toBe(98);
  });
});

describe("Reservas: normalización y errores", () => {
  it("normaliza requestId, monto a 2 decimales y vencimiento", () => {
    const out = normalizeReservationInput(
      {
        userId: " u-1 ",
        requestId: " req-1 ",
        amountUsd: 10.005,
        expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
      },
      NOW,
    );
    expect(out.userId).toBe("u-1");
    expect(out.requestId).toBe("req-1");
    expect(out.amountUsd).toBe(10.01);
  });

  it("rechaza usuario vacío, monto inválido y cotización vencida", () => {
    const base = { userId: "u-1", requestId: "r-1", amountUsd: 10, expiresAt: NOW.toISOString() };
    expect(() => normalizeReservationInput({ ...base, userId: " " }, NOW)).toThrowError(/sesión/i);
    expect(() => normalizeReservationInput({ ...base, amountUsd: 0, expiresAt: new Date(NOW.getTime() + 1).toISOString() }, NOW)).toThrowError(/monto/i);
    expect(() => normalizeReservationInput(base, NOW)).toThrowError(/venció/i);
  });

  it("traduce los códigos SQL a DomainError de límites", () => {
    expect(mapReservationFailure(new Error("MV_LIMIT_ORDER")).code).toBe("LIMIT_ORDER");
    expect(mapReservationFailure(new Error("MV_LIMIT_DAILY")).code).toBe("LIMIT_DAILY");
    expect(mapReservationFailure(new Error("MV_LIMIT_MONTHLY")).code).toBe("LIMIT_MONTHLY");
    expect(mapReservationFailure(new Error("MV_LIMIT_GLOBAL")).code).toBe("LIMIT_GLOBAL");
    expect(mapReservationFailure(new Error("MV_RESERVATION_CONFLICT")).code).toBe("VALIDATION");
    expect(mapReservationFailure(new Error("MV_RESERVATION_EXPIRED")).code).toBe("QUOTE_EXPIRED");
    expect(mapReservationFailure(new Error("network down")).code).toBe("UPSTREAM");
  });
});

describe("Reservas: flujo quote → build → submit", () => {
  it("reserva el cupo con la entrada normalizada", async () => {
    const store = makeStore();
    const out = await reserveOrThrow(
      store,
      {
        userId: "u-1",
        requestId: " q-1 ",
        amountUsd: 50.004,
        expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
      },
      NOW,
    );
    expect(store.reserved).toHaveLength(1);
    expect(store.reserved[0]?.requestId).toBe("q-1");
    expect(store.reserved[0]?.amountUsd).toBe(50);
    expect(out.status).toBe("reserved");
  });

  it("si el monto devuelto no coincide, falla cerrado", async () => {
    const store = makeStore();
    store.reserveResult = record({ amountUsd: 99 });
    await expect(
      reserveOrThrow(
        store,
        {
          userId: "u-1",
          requestId: "q-1",
          amountUsd: 100,
          expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
        },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "UPSTREAM" });
  });

  it("assertReservationActive rechaza liberada, vencida y monto distinto", () => {
    expect(() => assertReservationActive(null, { now: NOW })).toThrowError(/no existe/i);
    expect(() =>
      assertReservationActive(record({ status: "released" }), { now: NOW }),
    ).toThrowError(/ya no está activa/i);
    expect(() =>
      assertReservationActive(
        record({ expiresAt: new Date(NOW.getTime() - 1).toISOString() }),
        { now: NOW },
      ),
    ).toThrowError(/venció/i);
    expect(() =>
      assertReservationActive(record({ amountUsd: 100 }), { now: NOW, amountUsd: 120 }),
    ).toThrowError(/no coincide/i);
    expect(() =>
      assertReservationActive(record({ amountUsd: 100 }), { now: NOW, amountUsd: 100.005 }),
    ).not.toThrow();
  });

  it("rekey solo si Jupiter cambió el requestId; si no, valida la reserva", async () => {
    const store = makeStore();
    await rekeyOrThrow(store, "u-1", "q-1", "r-1", NOW);
    expect(store.rekeyed).toEqual(["q-1->r-1"]);
    await rekeyOrThrow(store, "u-1", "q-1", "q-1", NOW);
    expect(store.rekeyed).toHaveLength(1);
  });

  it("submit consume una reserva activa y acepta el reintento idempotente", async () => {
    const store = makeStore(record({ status: "reserved" }));
    await expect(assertSubmitReservation(store, "u-1", "r-1", NOW)).resolves.toBe("consumed");
    expect(store.consumed).toEqual(["r-1"]);

    const consumed = makeStore(record({ status: "consumed" }));
    await expect(assertSubmitReservation(consumed, "u-1", "r-1", NOW)).resolves.toBe(
      "already_consumed",
    );
    expect(consumed.consumed).toHaveLength(0);

    const released = makeStore(record({ status: "released" }));
    await expect(assertSubmitReservation(released, "u-1", "r-1", NOW)).rejects.toMatchObject({
      code: "QUOTE_EXPIRED",
    });
  });

  it("una reserva vencida se corta antes de consumir", async () => {
    const store = makeStore(record({ expiresAt: new Date(NOW.getTime() - 1).toISOString() }));
    await expect(assertSubmitReservation(store, "u-1", "r-1", NOW)).rejects.toMatchObject({
      code: "QUOTE_EXPIRED",
    });
    expect(store.consumed).toHaveLength(0);
  });

  it("consumeOrThrow falla si la reserva ya no está activa", async () => {
    const store = makeStore(record({ status: "released" }));
    await expect(consumeOrThrow(store, "u-1", "r-1", 100)).rejects.toMatchObject({
      code: "QUOTE_EXPIRED",
    });
  });

  it("releaseQuietly nunca lanza", async () => {
    const store = makeStore();
    store.release = async () => {
      throw new Error("db down");
    };
    await expect(releaseQuietly(store, "u-1", "r-1")).resolves.toBe(false);
  });
});

describe("Reservas en los topes (defensa en profundidad)", () => {
  it("countActiveReservations ignora vencidas y montos inválidos", () => {
    const rows: CountedReservation[] = [
      { amountUsd: 100, expiresAt: new Date(NOW.getTime() + 60_000).toISOString() },
      { amountUsd: 50, expiresAt: new Date(NOW.getTime() - 1).toISOString() },
      { amountUsd: 0, expiresAt: new Date(NOW.getTime() + 60_000).toISOString() },
      { amountUsd: -5, expiresAt: new Date(NOW.getTime() + 60_000).toISOString() },
      { amountUsd: 25, expiresAt: "no-es-fecha" },
    ];
    expect(countActiveReservations(rows, NOW.getTime())).toBe(100);
  });

  it("una reserva activa descuenta cupo diario", async () => {
    const verdict = await checkLimits(
      "u-1",
      150,
      makeDeps({
        reservations: [
          { amountUsd: 400, expiresAt: new Date(NOW.getTime() + 60_000).toISOString() },
        ],
      }),
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("LIMIT_DAILY");
  });

  it("una reserva vencida no descuenta cupo", async () => {
    const verdict = await checkLimits(
      "u-1",
      100,
      makeDeps({
        reservations: [
          { amountUsd: 400, expiresAt: new Date(NOW.getTime() - 60_000).toISOString() },
        ],
      }),
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.remainingUsd).toBe(400);
  });

  it("el tope global suma reservas de todos los usuarios", async () => {
    const verdict = await checkLimits(
      "u-1",
      100,
      makeDeps({
        globalReservations: [
          { amountUsd: 9_950, expiresAt: new Date(NOW.getTime() + 60_000).toISOString() },
        ],
      }),
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("LIMIT_GLOBAL");
  });

  it("si la lectura de reservas falla, checkLimits falla cerrado", async () => {
    const deps = makeDeps();
    deps.listReservations = async () => {
      throw new Error("db down");
    };
    await expect(checkLimits("u-1", 50, deps)).rejects.toMatchObject({ code: "UPSTREAM" });
  });
});

describe("Rutas reales: reservas conectadas detrás del bloqueo", () => {
  const quote = readFileSync(path.join(ROOT, "app/api/trade/quote/route.ts"), "utf8");
  const build = readFileSync(path.join(ROOT, "app/api/trade/build/route.ts"), "utf8");
  const submit = readFileSync(path.join(ROOT, "app/api/trade/submit/route.ts"), "utf8");

  it("quote reserva cupo al guardar la cotización y valida integridad", () => {
    expect(quote).toMatch(/assertQuoteIntegrity\(/);
    // Ola 6/T38: el cupo y la cotización se guardan juntos, en la reserva
    // compartida, dentro del motor live (una sola fila por cotización).
    const live = readFileSync(path.join(ROOT, "lib", "services", "trade.live.ts"), "utf8");
    expect(live).toMatch(/saveQuotedTrade\(/);
    const store = readFileSync(path.join(ROOT, "lib", "trade", "quote-store.ts"), "utf8");
    expect(store).toMatch(/reserveOrThrow\(/);
    expect(store).toMatch(/releaseQuietly\(/);
  });

  it("build valida la reserva antes de armar y la re-etiqueta si cambia el requestId", () => {
    expect(build).toMatch(/assertRealTradeReservation\(/);
    expect(build).toMatch(/rekeyRealTradeReservation\(/);
    expect(build.indexOf("assertRealTradeReservation(")).toBeGreaterThan(
      build.indexOf("assertRealTradeAllowed("),
    );
  });

  it("submit consume la reserva antes de enviar", () => {
    expect(submit).toMatch(/assertRealSubmitReservation\(/);
    expect(submit.indexOf("assertRealSubmitReservation(")).toBeGreaterThan(
      submit.indexOf("assertRealTradeAllowed("),
    );
  });

  it("la compuerta de ejecución real sigue cerrada", async () => {
    const guards = await import("@/lib/trade/real-guards");
    expect(guards.REAL_EXECUTION_LOCKED).toBe(true);
    await expect(guards.reserveRealTradeAmount({
      userId: "u-1",
      requestId: "r-1",
      amountUsd: 10,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })).rejects.toMatchObject({ code: "REAL_DISABLED" });
  });
});
