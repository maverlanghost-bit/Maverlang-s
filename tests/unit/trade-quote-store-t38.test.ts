import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  claimQuotedTradeBuild,
  LIVE_QUOTE_VERSION,
  loadQuotedTrade,
  parseLiveQuotePayload,
  saveQuotedTrade,
  type LiveQuotePayload,
  type LiveQuoteStatus,
  type LiveQuoteStore,
} from "@/lib/trade/quote-store";
import type {
  ReservationRecord,
  ReservationStatus,
  ReservationStore,
} from "@/lib/trade/reservations";
import { createLiveTrade } from "@/lib/services/trade.live";

/**
 * Ola 6 / T38 — la cotización real vive en la reserva compartida (M-05).
 *
 * Todo corre con almacenes falsos en memoria: sin red, sin Supabase y sin
 * `.env`. Lo que se prueba es exactamente lo que cambia la ola:
 *
 *  1. dos procesos no comparten la cotización si no pasan por el almacén;
 *  2. una segunda cotización del mismo usuario y símbolo deja UNA sola reserva
 *     abierta (D-06: no se acumulan topes);
 *  3. el camino real no usa el `Map` del proceso (y la demo sí lo conserva).
 *
 * El motor live se instancia con `createLiveTrade(stores)`: cada instancia es
 * una "lambda" distinta con su propia memoria; lo único compartido son los
 * almacenes que se le pasan.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const STOCK_MINT = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WALLET = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

type FakeReservationRow = {
  userId: string;
  requestId: string;
  amountUsd: number;
  status: ReservationStatus;
  expiresAt: string;
};

const rowKey = (userId: string, requestId: string) => `${userId}|${requestId}`;

/** Almacén de cupo falso con la semántica de 0042: una reserva abierta por usuario. */
function makeReservationStore() {
  const rows = new Map<string, FakeReservationRow>();

  const store: ReservationStore = {
    async reserve(input): Promise<ReservationRecord> {
      const key = rowKey(input.userId, input.requestId);
      const existing = rows.get(key);
      if (existing) {
        if (
          existing.status === "reserved" &&
          Date.parse(existing.expiresAt) > Date.now() &&
          existing.amountUsd === input.amountUsd
        ) {
          return { id: input.requestId, ...existing, status: "reserved" };
        }
        throw new Error("MV_RESERVATION_CONFLICT");
      }
      // D-06: la cotización nueva reemplaza a la anterior del mismo usuario.
      for (const row of rows.values()) {
        if (row.userId === input.userId && row.status === "reserved") row.status = "released";
      }
      const row: FakeReservationRow = {
        userId: input.userId,
        requestId: input.requestId,
        amountUsd: Math.round(input.amountUsd * 100) / 100,
        status: "reserved",
        expiresAt: input.expiresAt,
      };
      rows.set(key, row);
      return { id: row.requestId, amountUsd: row.amountUsd, expiresAt: row.expiresAt, status: "reserved" };
    },
    async consume(userId, requestId) {
      const row = rows.get(rowKey(userId, requestId));
      if (!row || row.status !== "reserved" || Date.parse(row.expiresAt) <= Date.now()) return false;
      row.status = "consumed";
      return true;
    },
    async release(userId, requestId) {
      const row = rows.get(rowKey(userId, requestId));
      if (!row || row.status !== "reserved") return false;
      row.status = "released";
      return true;
    },
    async read(userId, requestId) {
      const row = rows.get(rowKey(userId, requestId));
      if (!row) return null;
      return { id: row.requestId, amountUsd: row.amountUsd, expiresAt: row.expiresAt, status: row.status };
    },
    async releaseOthers(userId, keepRequestId) {
      let released = 0;
      for (const row of rows.values()) {
        if (row.userId === userId && row.status === "reserved" && row.requestId !== keepRequestId) {
          row.status = "released";
          released += 1;
        }
      }
      return released;
    },
  };

  return {
    store,
    rows,
    openFor: (userId: string) =>
      [...rows.values()].filter((row) => row.userId === userId && row.status === "reserved"),
    statusOf: (userId: string, requestId: string) => rows.get(rowKey(userId, requestId))?.status ?? null,
  };
}

/** Almacén de payload falso: la cotización cuelga de la reserva, como en la base. */
function makeQuoteStore(reservations: ReturnType<typeof makeReservationStore>) {
  const rows = new Map<
    string,
    { payload: LiveQuotePayload; status: LiveQuoteStatus; reservationExpiresAt: string }
  >();
  let reads = 0;

  const store: LiveQuoteStore = {
    async saveQuote(input) {
      const key = rowKey(input.userId, input.requestId);
      const reservation = reservations.rows.get(key);
      if (
        !reservation ||
        reservation.status !== "reserved" ||
        Date.parse(reservation.expiresAt) <= Date.now()
      ) {
        throw new Error("MV_QUOTE_MISSING");
      }
      if (rows.has(key)) throw new Error("MV_QUOTE_EXISTS");
      rows.set(key, {
        payload: input.payload,
        status: "reserved",
        reservationExpiresAt: reservation.expiresAt,
      });
    },
    async readQuote(userId, requestId) {
      reads += 1;
      const key = rowKey(userId, requestId);
      const row = rows.get(key);
      if (!row) return null;
      const reservation = reservations.rows.get(key);
      return {
        payload: row.payload,
        status: reservation?.status ?? row.status,
        reservationExpiresAt: row.reservationExpiresAt,
      };
    },
    async claimBuild(userId, requestId) {
      const key = rowKey(userId, requestId);
      const row = rows.get(key);
      const reservation = reservations.rows.get(key);
      if (
        !row ||
        !reservation ||
        reservation.status !== "reserved" ||
        Date.parse(reservation.expiresAt) <= Date.now()
      ) {
        return false;
      }
      if (row.payload.built) return false;
      row.payload = { ...row.payload, built: true };
      return true;
    },
    async recordBuilt(userId, requestId, patch) {
      const key = rowKey(userId, requestId);
      const row = rows.get(key);
      if (!row || !row.payload.built) throw new Error("MV_QUOTE_MISSING");
      row.payload = {
        ...row.payload,
        inAmountUi: patch.inAmountUi,
        outAmountUi: patch.outAmountUi,
        priceUsd: patch.priceUsd,
        builtTransactionBase64: patch.builtTransactionBase64,
      };
    },
  };

  return {
    store,
    rows,
    readCount: () => reads,
    payloadOf: (userId: string, requestId: string) => rows.get(rowKey(userId, requestId))?.payload ?? null,
  };
}

/** Un "proceso" completo: su almacén de cupo y el de cotizaciones. */
function makeProcess() {
  const reservations = makeReservationStore();
  const quotes = makeQuoteStore(reservations);
  return { reservations, quotes, deps: { reservations: reservations.store, quotes: quotes.store } };
}

function payloadFor(requestId: string, overrides: Partial<LiveQuotePayload> = {}): LiveQuotePayload {
  return {
    version: LIVE_QUOTE_VERSION,
    requestId,
    side: "buy",
    symbol: "AAPLx",
    mint: STOCK_MINT,
    inputMint: USDC,
    outputMint: STOCK_MINT,
    amountRaw: "100000000",
    priceUsd: 250,
    inAmountUi: 100,
    outAmountUi: 0.4,
    feeBps: 0,
    feeUsd: 0,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    inputDecimals: 6,
    outputDecimals: 8,
    inputMultiplier: 1,
    outputMultiplier: 1,
    built: false,
    builtTransactionBase64: null,
    ...overrides,
  };
}

const RESERVATION_EXPIRES_AT = () => new Date(Date.now() + 120_000).toISOString();

describe("T38: la cotización real vive en la reserva compartida", () => {
  it("dos procesos no comparten la cotización si no pasan por el almacén", async () => {
    const a = makeProcess();
    const b = makeProcess();

    await saveQuotedTrade(a.deps, {
      userId: USER,
      amountUsd: 100,
      reservationExpiresAt: RESERVATION_EXPIRES_AT(),
      payload: payloadFor("quote-a"),
    });

    // El proceso que la guardó la ve.
    const seenByA = await loadQuotedTrade(a.deps, USER, "quote-a");
    expect(seenByA?.payload.requestId).toBe("quote-a");
    expect(seenByA?.status).toBe("reserved");

    // Otro proceso con su propia memoria (otra lambda) no la ve: no hay canal
    // fuera del almacén.
    const seenByB = await loadQuotedTrade(b.deps, USER, "quote-a");
    expect(seenByB).toBeNull();
    expect(b.quotes.readCount()).toBe(1);

    // Y el motor live de B falla cerrado por esa cotización, sin red.
    const tradeB = createLiveTrade(b.deps);
    await expect(
      tradeB.build({ quoteId: "quote-a", userPublicKey: WALLET }, USER),
    ).rejects.toMatchObject({ code: "QUOTE_EXPIRED" });
  });

  it("el motor live de otra instancia lee la cotización del almacén compartido", async () => {
    const shared = makeProcess();
    await saveQuotedTrade(shared.deps, {
      userId: USER,
      amountUsd: 100,
      reservationExpiresAt: RESERVATION_EXPIRES_AT(),
      payload: payloadFor("quote-shared"),
    });

    // Instancia nueva: lo único que tiene en común es el almacén.
    const trade = createLiveTrade(shared.deps);

    // La cotización está: el armado pasa de la lectura y se reclama. La llamada
    // a Jupiter no ocurre en la prueba (sin red): el claim sí queda hecho, que
    // es justo lo que el `Map` no podía garantizar entre instancias.
    const claim = await claimQuotedTradeBuild(shared.deps, USER, "quote-shared");
    expect(claim).toBe(true);

    await expect(
      trade.build({ quoteId: "quote-shared", userPublicKey: WALLET }, USER),
    ).rejects.toMatchObject({ code: "QUOTE_EXPIRED" });
    expect(shared.quotes.readCount()).toBeGreaterThan(0);
  });

  it("una segunda cotización del mismo usuario y símbolo deja una sola reserva abierta", async () => {
    const process = makeProcess();

    await saveQuotedTrade(process.deps, {
      userId: USER,
      amountUsd: 100,
      reservationExpiresAt: RESERVATION_EXPIRES_AT(),
      payload: payloadFor("quote-1"),
    });
    expect(process.reservations.openFor(USER)).toHaveLength(1);

    await saveQuotedTrade(process.deps, {
      userId: USER,
      amountUsd: 180,
      reservationExpiresAt: RESERVATION_EXPIRES_AT(),
      payload: payloadFor("quote-2", { inAmountUi: 180, outAmountUi: 0.72 }),
    });

    const open = process.reservations.openFor(USER);
    expect(open).toHaveLength(1);
    expect(open[0]?.requestId).toBe("quote-2");
    expect(open[0]?.amountUsd).toBe(180);
    expect(process.reservations.statusOf(USER, "quote-1")).toBe("released");

    // La cotización vieja ya no se puede armar; la nueva sí.
    const old = await loadQuotedTrade(process.deps, USER, "quote-1");
    expect(old?.status).toBe("released");
    await expect(claimQuotedTradeBuild(process.deps, USER, "quote-1")).resolves.toBe(false);
    await expect(claimQuotedTradeBuild(process.deps, USER, "quote-2")).resolves.toBe(true);
    // Y una cotización se arma UNA sola vez.
    await expect(claimQuotedTradeBuild(process.deps, USER, "quote-2")).resolves.toBe(false);
  });

  it("la cotización es de su dueño: otro usuario no la lee ni la arma", async () => {
    const process = makeProcess();
    await saveQuotedTrade(process.deps, {
      userId: USER,
      amountUsd: 100,
      reservationExpiresAt: RESERVATION_EXPIRES_AT(),
      payload: payloadFor("quote-owner"),
    });

    expect(await loadQuotedTrade(process.deps, OTHER_USER, "quote-owner")).toBeNull();
    await expect(claimQuotedTradeBuild(process.deps, OTHER_USER, "quote-owner")).resolves.toBe(false);
  });

  it("cotizar sin usuario no reserva nada: falla cerrado", async () => {
    const process = makeProcess();
    await expect(
      saveQuotedTrade(process.deps, {
        userId: "   ",
        amountUsd: 100,
        reservationExpiresAt: RESERVATION_EXPIRES_AT(),
        payload: payloadFor("quote-sin-dueno"),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(process.reservations.rows.size).toBe(0);
    expect(process.quotes.rows.size).toBe(0);
  });

  it("si no se puede guardar el payload, se libera el cupo y no queda cotización", async () => {
    const process = makeProcess();
    const broken: LiveQuoteStore = {
      ...process.quotes.store,
      async saveQuote() {
        throw new Error("quote_save_failed");
      },
    };

    await expect(
      saveQuotedTrade(
        { reservations: process.reservations.store, quotes: broken },
        {
          userId: USER,
          amountUsd: 100,
          reservationExpiresAt: RESERVATION_EXPIRES_AT(),
          payload: payloadFor("quote-rota"),
        },
      ),
    ).rejects.toMatchObject({ code: "UPSTREAM" });

    expect(process.reservations.openFor(USER)).toHaveLength(0);
    expect(process.reservations.statusOf(USER, "quote-rota")).toBe("released");
    expect(await loadQuotedTrade(process.deps, USER, "quote-rota")).toBeNull();
  });

  it("si el almacén no responde, armar y enviar fallan cerrado (sin memoria de respaldo)", async () => {
    const process = makeProcess();
    await saveQuotedTrade(process.deps, {
      userId: USER,
      amountUsd: 100,
      reservationExpiresAt: RESERVATION_EXPIRES_AT(),
      payload: payloadFor("quote-caida"),
    });

    const down: LiveQuoteStore = {
      ...process.quotes.store,
      async readQuote() {
        throw new Error("quote_read_failed");
      },
    };
    const trade = createLiveTrade({ reservations: process.reservations.store, quotes: down });

    await expect(
      trade.build({ quoteId: "quote-caida", userPublicKey: WALLET }, USER),
    ).rejects.toMatchObject({ code: "UPSTREAM" });
    await expect(
      trade.submit({ requestId: "quote-caida", signedTransactionBase64: "firmada" }, USER),
    ).rejects.toMatchObject({ code: "UPSTREAM" });
  });

  it("una cotización vencida no se arma", async () => {
    const process = makeProcess();
    await saveQuotedTrade(process.deps, {
      userId: USER,
      amountUsd: 100,
      reservationExpiresAt: RESERVATION_EXPIRES_AT(),
      payload: payloadFor("quote-vigente"),
    });
    // Se guarda vigente y luego vence el TTL del payload (no el de la reserva).
    const row = process.quotes.rows.get(rowKey(USER, "quote-vigente"));
    if (!row) throw new Error("falta la cotización de prueba");
    row.payload = { ...row.payload, expiresAt: new Date(Date.now() - 1_000).toISOString() };

    const stored = await loadQuotedTrade(process.deps, USER, "quote-vigente");
    expect(stored?.payload.expiresAt).toBe(row.payload.expiresAt);

    const trade = createLiveTrade(process.deps);
    await expect(
      trade.build({ quoteId: "quote-vigente", userPublicKey: WALLET }, USER),
    ).rejects.toMatchObject({ code: "QUOTE_EXPIRED" });
  });

  it("un payload corrupto o armado sin transacción no se acepta", () => {
    expect(parseLiveQuotePayload(null)).toBeNull();
    expect(parseLiveQuotePayload({ ...payloadFor("q"), version: 99 })).toBeNull();
    expect(parseLiveQuotePayload({ ...payloadFor("q"), amountRaw: "0" })).toBeNull();
    expect(parseLiveQuotePayload({ ...payloadFor("q"), priceUsd: -1 })).toBeNull();
    expect(parseLiveQuotePayload({ ...payloadFor("q"), side: "swap" })).toBeNull();
    // Armado sin la tx: inservible para `submit`, se descarta.
    expect(parseLiveQuotePayload({ ...payloadFor("q"), built: true })).toBeNull();
    expect(
      parseLiveQuotePayload({
        ...payloadFor("q"),
        built: true,
        builtTransactionBase64: "base64-de-la-tx",
      })?.builtTransactionBase64,
    ).toBe("base64-de-la-tx");
  });
});

describe("T38: el camino real ya no usa el Map del proceso", () => {
  it("trade.live no tiene Map de cotizaciones y lee/escribe en el almacén", () => {
    const live = readFileSync(path.join(ROOT, "lib", "services", "trade.live.ts"), "utf8");
    expect(live).not.toMatch(/new Map/);
    expect(live).not.toMatch(/liveQuotes/);
    expect(live).toMatch(/saveQuotedTrade\(/);
    expect(live).toMatch(/loadQuotedTrade\(/);
    expect(live).toMatch(/claimQuotedTradeBuild\(/);
    expect(live).toMatch(/createTradeQuoteStore\(\)/);
    expect(live).toMatch(/createLiveTrade\(/);
    // El TTL sale de la cotización, no de un reloj de proceso.
    expect(live).toMatch(/liveQuoteExpired\(/);
  });

  it("la demo conserva su Map: no pasa por la tabla", () => {
    const demo = readFileSync(path.join(ROOT, "lib", "mocks", "demo-state.ts"), "utf8");
    expect(demo).toMatch(/quotes: new Map/);
    expect(demo).not.toMatch(/trade_reservations|createTradeQuoteStore/);
  });

  it("la reserva y la cotización se guardan en la misma fila (0049, sin tocar 0042/0047)", () => {
    const sql = readFileSync(
      path.join(ROOT, "supabase", "migrations", "0049_trade_quote_store.sql"),
      "utf8",
    );
    expect(sql).toMatch(/alter table public\.trade_reservations\s+add column if not exists quote_payload jsonb/i);
    for (const fn of [
      "save_trade_quote",
      "claim_trade_quote_build",
      "record_trade_quote_build",
      "read_trade_quote",
    ]) {
      expect(sql).toMatch(new RegExp(`create or replace function public\\.${fn}`, "i"));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}[^;]*to service_role`, "i"));
    }
    // El claim es un compare-and-set sobre `built`.
    expect(sql).toMatch(/'\{built\}', 'true'::jsonb/);
    expect(sql).toMatch(/coalesce\(r\.quote_payload ->> 'built', 'false'\) = 'false'/);
    expect(sql).toMatch(/coalesce\(r\.quote_payload ->> 'built', 'false'\) = 'true'/);
  });

  it("el candado del dinero real sigue cerrado y ningún flag se encendió", () => {
    const guards = readFileSync(path.join(ROOT, "lib", "trade", "real-guards.ts"), "utf8");
    expect(guards).toMatch(/export const REAL_EXECUTION_LOCKED: boolean = true;/);
  });
});
