import { beforeEach, describe, expect, it, vi } from "vitest";

import { USDC_MINT } from "@/config/tickers";
import { DomainError } from "@/lib/api/result";
import { createLiveTrade } from "@/lib/services/trade.live";
import type { LiveQuotePayload, LiveQuoteStore } from "@/lib/trade/quote-store";
import type { ReservationStatus, ReservationStore } from "@/lib/trade/reservations";

/**
 * T43 — compra en pesos (CLP) del comercio real.
 *
 * La cotización nace en pesos y el swap vive en USDC: sin un dólar observado
 * la compra en CLP no se puede armar, y con un dólar inventado el usuario
 * pagaría un monto que no corresponde. Estas pruebas fijan el contrato de
 * `livePrices.fx()` dentro de `createLiveTrade`:
 *
 *  1. con un dólar válido, el monto se convierte a USDC ANTES de pedirle la
 *     orden a Jupiter y la cotización devuelve `fx` y el total en pesos;
 *  2. si el dólar falla o no es un número > 0, cotizar falla cerrado
 *     (UPSTREAM) sin llamar a Jupiter y sin tomar cupo;
 *  3. una compra en USDC no consulta el dólar: `fx` y `estimatedTotalClp`
 *     quedan sin definir.
 *
 * Todo corre con piezas inyectadas en memoria (mismo patrón que
 * `trade-quote-store-t38`): sin red, sin Supabase y sin `.env`. No se inventa
 * ningún monto: sólo se comprueba la aritmética declarada.
 */

const USER = "11111111-1111-4111-8111-111111111111";
/** Compra de ejemplo: 95.050 CLP con dólar 950,5 → 100 USDC exactos. */
const CLP_AMOUNT = 95_050;
const FX_RATE = 950.5;
/** Precio de referencia (spot) que usa la guardia de desviación. */
const SPOT_PRICE_USD = 250;

const state = vi.hoisted(() => ({
  /** Mint xStocks de la acción de prueba (AAPLx). */
  mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
  symbol: "AAPLx",
  fx: vi.fn(),
  list: vi.fn(),
  jupiter: vi.fn(),
  jupiterUrls: [] as string[],
}));

/** Dólar observado: se controla por prueba (éxito, error, tasa inválida). */
vi.mock("@/lib/services/prices.live", () => ({
  livePrices: { list: state.list, fx: state.fx },
}));

/** Allowlist: la prueba es de montos, no de catálogo. */
vi.mock("@/lib/catalog/tradable", () => ({
  requireOperable: async (symbol: string) => ({ symbol, mint: state.mint }),
}));

/** Multiplicador Token-2022 sin RPC (1 = sin escalado). */
vi.mock("@/lib/solana/scaled-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/solana/scaled-ui")>();
  return { ...actual, fetchMintMultiplier: async () => 1 };
});

/** Jupiter: sin red. Registra la URL para poder mirar el monto pedido. */
vi.mock("@/lib/market/jupiter-client", () => ({
  fetchJupiterOrder: state.jupiter,
}));

const rowKey = (userId: string, requestId: string) => `${userId}|${requestId}`;

type Row = {
  userId: string;
  requestId: string;
  amountUsd: number;
  status: ReservationStatus;
  expiresAt: string;
};

/**
 * Almacenes falsos en memoria: cupo y payload de la cotización, como en la
 * base (0042/0049). Una sola reserva abierta por usuario (D-06).
 */
function makeDeps() {
  const rows = new Map<string, Row>();
  const payloads = new Map<string, LiveQuotePayload>();

  const reservations: ReservationStore = {
    async reserve(input) {
      const id = rowKey(input.userId, input.requestId);
      if (rows.has(id)) throw new Error("MV_RESERVATION_CONFLICT");
      for (const row of rows.values()) {
        if (row.userId === input.userId && row.status === "reserved") row.status = "released";
      }
      const row: Row = { ...input, status: "reserved" };
      rows.set(id, row);
      return {
        id: row.requestId,
        amountUsd: row.amountUsd,
        expiresAt: row.expiresAt,
        status: row.status,
      };
    },
    async consume(userId, requestId) {
      const row = rows.get(rowKey(userId, requestId));
      if (!row || row.status !== "reserved") return false;
      row.status = "consumed";
      return true;
    },
    async release(userId, requestId) {
      const row = rows.get(rowKey(userId, requestId));
      if (!row) return false;
      row.status = "released";
      return true;
    },
    async read(userId, requestId) {
      const row = rows.get(rowKey(userId, requestId));
      if (!row) return null;
      return {
        id: row.requestId,
        amountUsd: row.amountUsd,
        expiresAt: row.expiresAt,
        status: row.status,
      };
    },
  };

  const quotes: LiveQuoteStore = {
    async saveQuote(input) {
      const id = rowKey(input.userId, input.requestId);
      const row = rows.get(id);
      if (!row || row.status !== "reserved") throw new Error("MV_QUOTE_MISSING");
      payloads.set(id, input.payload);
    },
    async readQuote(userId, requestId) {
      const id = rowKey(userId, requestId);
      const payload = payloads.get(id);
      const row = rows.get(id);
      if (!payload || !row) return null;
      return { payload, status: row.status, reservationExpiresAt: row.expiresAt };
    },
    async claimBuild(userId, requestId) {
      const id = rowKey(userId, requestId);
      const payload = payloads.get(id);
      const row = rows.get(id);
      if (!payload || payload.built || !row || row.status !== "reserved") return false;
      payloads.set(id, { ...payload, built: true });
      return true;
    },
    async recordBuilt(userId, requestId, patch) {
      const id = rowKey(userId, requestId);
      const payload = payloads.get(id);
      if (!payload) throw new Error("MV_QUOTE_MISSING");
      payloads.set(id, {
        ...payload,
        inAmountUi: patch.inAmountUi,
        outAmountUi: patch.outAmountUi,
        priceUsd: patch.priceUsd,
        builtTransactionBase64: patch.builtTransactionBase64,
      });
    },
  };

  return { deps: { reservations, quotes }, rows, payloads };
}

/** Orden de Jupiter: 100 USDC de entrada, 0,4 acciones de salida (US$250 c/u). */
function jupiterOrder() {
  return {
    requestId: "req-clp-1",
    inputMint: USDC_MINT,
    outputMint: state.mint,
    inAmount: "100000000",
    outAmount: "40000000",
    priceImpactPct: "0.01",
    slippageBps: 50,
    routePlan: [{ swapInfo: { label: "Raydium" } }],
  };
}

beforeEach(() => {
  state.fx.mockReset();
  state.list.mockReset();
  state.jupiter.mockReset();
  state.jupiterUrls.length = 0;

  state.fx.mockResolvedValue({
    pair: "USDCLP",
    rate: FX_RATE,
    source: "live",
    updatedAt: "2026-11-06T00:00:00.000Z",
  });
  state.list.mockResolvedValue([{ priceUsd: SPOT_PRICE_USD }]);
  state.jupiter.mockImplementation(async (input: { url: string }) => {
    state.jupiterUrls.push(input.url);
    return jupiterOrder();
  });
});

describe("T43: compra en CLP cotizada con el dólar observado", () => {
  it("convierte pesos a USDC con el dólar y devuelve el total en pesos", async () => {
    const process = makeDeps();
    const trade = createLiveTrade(process.deps);

    const quote = await trade.quote(
      { side: "buy", symbol: state.symbol, amount: CLP_AMOUNT, amountCurrency: "CLP" },
      USER,
    );

    expect(state.fx).toHaveBeenCalledTimes(1);
    // 95.050 CLP ÷ 950,5 = 100 USDC; la cotización se expresa en USDC.
    expect(quote.inAmountUi).toBeCloseTo(100, 8);
    expect(quote.outAmountUi).toBeCloseTo(0.4, 8);
    expect(quote.pricePerShareUsd).toBeCloseTo(SPOT_PRICE_USD, 6);
    // Y vuelve a pesos para que la pantalla muestre lo que el usuario pidió.
    expect(quote.fx).toBe(950.5);
    expect(quote.estimatedTotalClp).toBe(95_050);

    // Jupiter se pidió en USDC (crudo de 6 decimales), no en pesos.
    expect(state.jupiterUrls).toHaveLength(1);
    expect(state.jupiterUrls[0]).toContain("inputMint=" + USDC_MINT);
    expect(state.jupiterUrls[0]).toContain("amount=100000000");

    // El cupo y el payload guardado también quedan en dólares: reservar
    // 95.050 como si fueran dólares bloquearía el tope diario entero.
    const saved = process.rows.get(rowKey(USER, quote.id));
    expect(saved?.amountUsd).toBe(100);
    expect(process.payloads.get(rowKey(USER, quote.id))?.amountRaw).toBe("100000000");
  });

  it("si el dólar no está disponible, no cotiza ni llama a Jupiter", async () => {
    state.fx.mockRejectedValue(new DomainError("UPSTREAM", "Dólar no disponible"));
    const process = makeDeps();
    const trade = createLiveTrade(process.deps);

    await expect(
      trade.quote(
        { side: "buy", symbol: state.symbol, amount: CLP_AMOUNT, amountCurrency: "CLP" },
        USER,
      ),
    ).rejects.toMatchObject({ code: "UPSTREAM" });

    expect(state.jupiter).not.toHaveBeenCalled();
    // Sin dólar no se toma cupo: un fallo no puede retener el monto del usuario.
    expect(process.rows.size).toBe(0);
  });

  const invalidRates: Array<[string, number]> = [
    ["una tasa cero", 0],
    ["una tasa no numérica", Number.NaN],
  ];

  it.each(invalidRates)("con %s tampoco se cotiza (UPSTREAM)", async (_label, rate) => {
    state.fx.mockResolvedValue({
      pair: "USDCLP",
      rate,
      source: "live",
      updatedAt: "2026-11-06T00:00:00.000Z",
    });
    const process = makeDeps();
    const trade = createLiveTrade(process.deps);

    await expect(
      trade.quote(
        { side: "buy", symbol: state.symbol, amount: CLP_AMOUNT, amountCurrency: "CLP" },
        USER,
      ),
    ).rejects.toMatchObject({ code: "UPSTREAM" });

    expect(state.jupiter).not.toHaveBeenCalled();
    expect(process.rows.size).toBe(0);
  });

  it("una compra en USDC no consulta el dólar ni agrega montos en pesos", async () => {
    const process = makeDeps();
    const trade = createLiveTrade(process.deps);

    const quote = await trade.quote(
      { side: "buy", symbol: state.symbol, amount: 100, amountCurrency: "USDC" },
      USER,
    );

    expect(state.fx).not.toHaveBeenCalled();
    expect(quote.fx).toBeUndefined();
    expect(quote.estimatedTotalClp).toBeUndefined();
    expect(quote.inAmountUi).toBeCloseTo(100, 8);
    expect(state.jupiterUrls[0]).toContain("amount=100000000");
    expect(process.rows.get(rowKey(USER, quote.id))?.amountUsd).toBe(100);
  });
});
