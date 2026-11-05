import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as postQuote } from "@/app/api/trade/quote/route";
import { POST as postBuild } from "@/app/api/trade/build/route";
import { POST as postSubmit } from "@/app/api/trade/submit/route";
import { POST as postSendBuild } from "@/app/api/wallet/send/build/route";
import { USDC_MINT } from "@/config/tickers";
import { __resetFlagsForTests, __setFlagReaderForTests } from "@/lib/flags";
import { __resetRateLimitsForTests } from "@/lib/security/rate-limit";
import { createLiveTrade } from "@/lib/services/trade.live";
import {
  claimQuotedTradeBuild,
  LIVE_QUOTE_VERSION,
  recordQuotedTradeBuild,
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
import { USDC_DECIMALS, USDC_MINT_SOLANA } from "@/lib/wallet/deposit-indexer";
import { syncSolanaUsdcDeposits, type ParsedTxLike } from "@/lib/wallet/deposit-sync";
import { validateAndPrepareWithdrawal } from "@/lib/wallet/withdrawals";

/**
 * Pre-lanzamiento: REINTENTO e IDEMPOTENCIA del dinero, y GEOBLOQUEO con
 * mensajes saneados.
 *
 * Dos riesgos de dinero real se prueban acá, por el código que de verdad se
 * ejecuta (rutas y motores reales, sin red ni base):
 *
 *  A) Un reintento no puede acreditar dos veces un depósito ni descontar dos
 *     veces un retiro o una compra. Un doble crédito es dinero regalado y un
 *     doble débito es dinero del usuario perdido: en ambos casos la firma o
 *     el requestId son la unidad de idempotencia, y la prueba cuenta las
 *     ESCRITURAS y el MONTO total, no el "ok" de la respuesta.
 *
 *  B) Un país bloqueado tiene que recibir 403 GEO_BLOCKED ANTES de tocar al
 *     proveedor (Jupiter, Supabase, el motor de envío) y la respuesta al
 *     cliente nunca puede traer stack, URL de RPC ni el texto crudo de
 *     PostgREST: eso filtra infraestructura y sirve de mapa para atacar.
 *
 * `REAL_EXECUTION_LOCKED` sigue en `true` en el código de producción; acá se
 * abre SÓLO por mock (mismo criterio que `money-t40-*` y `wallet-t35-*`) para
 * observar lo que vive detrás de la compuerta.
 */

const USER = "11111111-1111-4111-8111-111111111111";
const ORIGIN = "11111111111111111111111111111111";
const DESTINATION = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const STOCK_MINT = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
const SITE = "https://maverlang.test";
const QUOTE_REQUEST_ID = "quote-prelaunch";

/**
 * `serverEnv` se congela al importar: el entorno de las rutas tiene que quedar
 * fijado ANTES de los imports (patrón de `money-t40`). DATA_MODE=mock deja el
 * catálogo y el motor en modo demo/CI (sin tocar Supabase); AUTH_MODE=mock
 * evita la rama de cuenta real, que está (y debe seguir) apagada.
 */
const envState = vi.hoisted(() => {
  const keys = [
    "DATA_MODE",
    "AUTH_MODE",
    "NEXT_PUBLIC_AUTH_MODE",
    "NEXT_PUBLIC_DATA_MODE",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SITE_URL",
    "REAL_TRADING_READY",
  ];
  const values: Record<string, string | undefined> = {
    DATA_MODE: "mock",
    AUTH_MODE: "mock",
    NEXT_PUBLIC_AUTH_MODE: "mock",
    NEXT_PUBLIC_DATA_MODE: "mock",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
    NEXT_PUBLIC_SITE_URL: "https://maverlang.test",
    // Para poder ejercitar `send/build`, que exige el flag encendido para armar
    // una salida; el candado de ejecución sigue cerrado en el código.
    REAL_TRADING_READY: "true",
  };
  const saved = new Map<string, string | undefined>();
  for (const key of keys) {
    saved.set(key, process.env[key]);
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return { saved };
});

/**
 * Traza compartida: lo que registra `apiOperateBlock` y lo que registran los
 * servicios externos. El ORDEN del arreglo es la evidencia de que el
 * geobloqueo corre primero ("geo" antes de "jupiter"/"sendBuild"/"execute").
 */
const state = vi.hoisted(() => ({
  trace: [] as string[],
  trade: {
    quote: vi.fn(),
    build: vi.fn(),
    submit: vi.fn(),
    status: vi.fn(),
  },
  portfolio: {
    sendBuild: vi.fn(),
    balances: vi.fn(),
  },
  auth: {
    getSession: vi.fn(async () => ({
      userId: "u-prelaunch",
      walletAddress: null as string | null,
    })),
  },
  /** Motor real inyectado para la prueba de idempotencia de `submit`. */
  tradeOverride: null as null | Record<string, unknown>,

  // Barrido de depósitos: espejo en memoria de las tablas.
  cryptoDeposits: [] as Array<{
    userId: string;
    mint: string;
    amountUi: number;
    signature: string;
    fromAddress: string | null;
  }>,
  depositInsertAttempts: 0,
  movements: [] as Array<{ reference: string; status: string; amountUi: number }>,
  scan: {
    signatures: [] as string[],
    txs: [] as unknown[],
    statuses: [] as unknown[],
  },

  // `orders`: clave única (user_id, request_id), como el índice de la 0031.
  orders: new Map<
    string,
    { id: string; status: "pending" | "submitted" | "failed"; signature: string | null }
  >(),
  executeCalls: 0,
}));

const orderKey = (userId: string, requestId: string) => `${userId}|${requestId}`;

/**
 * `apiOperateBlock` se envuelve (no se reemplaza): se registra la llamada y se
 * delega en la implementación REAL, así el 403 GEO_BLOCKED y su cuerpo los
 * sigue produciendo el código de producción.
 */
vi.mock("@/lib/compliance/real-quote", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/compliance/real-quote")>();
  return {
    ...actual,
    apiOperateBlock: (req: Request) => {
      state.trace.push("geo");
      return actual.apiOperateBlock(req);
    },
  };
});

/**
 * Sólo se abren las dos compuertas que impiden llegar al proveedor en este
 * entorno (candado de ejecución y kill switch de salidas). El resto de las
 * guardias sigue siendo el código real.
 */
vi.mock("@/lib/trade/real-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/trade/real-guards")>();
  return {
    ...actual,
    assertRealExecutionLocked: () => undefined,
    assertRealWithdrawalsEnabled: async () => undefined,
  };
});

vi.mock("@/lib/services", () => ({
  getServices: () => ({
    auth: state.auth,
    trade: state.tradeOverride ?? state.trade,
    portfolio: state.portfolio,
  }),
}));

/** Barrido de depósitos: lectura de cadena simulada (sin RPC real). */
vi.mock("@/lib/solana/connection", () => ({
  getServerConnection: () => ({
    getSignaturesForAddress: async () =>
      state.scan.signatures.map((signature) => ({ signature })),
    getParsedTransactions: async () => state.scan.txs,
    getSignatureStatuses: async () => ({ value: state.scan.statuses }),
  }),
}));

/** Libro de depósitos: la firma es única; se cuentan los intentos de escritura. */
vi.mock("@/lib/services/deposits.supabase", () => ({
  countDepositScanWallets: async () => 1,
  listWalletsForDepositScan: async () => [{ userId: USER, address: ORIGIN }],
  listDepositSignaturesForScan: async (userId: string) =>
    state.cryptoDeposits.filter((row) => row.userId === userId).map((row) => row.signature),
  insertCryptoDeposit: async (input: {
    userId: string;
    mint: string;
    amountUi: number;
    signature: string;
    fromAddress: string | null;
  }) => {
    state.depositInsertAttempts += 1;
    if (state.cryptoDeposits.some((row) => row.signature === input.signature)) return false;
    state.cryptoDeposits.push(input);
    return true;
  },
  findCryptoDepositOwner: async (signature: string) => {
    const row = state.cryptoDeposits.find((item) => item.signature === signature);
    return { ok: true, userId: row?.userId ?? null };
  },
}));

vi.mock("@/lib/services/wallet-movements.supabase", () => ({
  upsertWalletMovement: async (input: {
    reference: string;
    status: string;
    amountUi: number;
  }) => {
    if (state.movements.some((row) => row.reference === input.reference)) return false;
    state.movements.push({
      reference: input.reference,
      status: input.status,
      amountUi: input.amountUi,
    });
    return true;
  },
}));

/** `orders` real: el reclamo antes de enviar es un INSERT con request_id único. */
vi.mock("@/lib/services/orders.supabase", () => ({
  claimOrderExecution: async (row: {
    userId: string;
    requestId: string;
    signature?: string | null;
  }) => {
    const key = orderKey(row.userId, row.requestId);
    const existing = state.orders.get(key);
    if (existing) {
      return {
        id: existing.id,
        status: existing.status,
        signature: existing.signature,
        claimed: false,
      };
    }
    const created = {
      id: `order-${state.orders.size + 1}`,
      status: "pending" as const,
      signature: row.signature ?? null,
    };
    state.orders.set(key, created);
    return {
      id: created.id,
      status: created.status,
      signature: created.signature,
      claimed: true,
    };
  },
  finalizeOrderExecution: async (
    id: string,
    outcome: { status: "submitted" | "failed"; signature: string | null },
  ) => {
    for (const order of state.orders.values()) {
      if (order.id !== id) continue;
      if (order.status !== "pending") return false;
      order.status = outcome.status;
      order.signature = outcome.signature ?? order.signature;
      return true;
    }
    return false;
  },
  updateOrderStatus: async () => false,
  getOrderById: async () => null,
  getOrderByIdForUser: async () => null,
}));

/** Multiplicador del mint sin RPC (1 = sin escalado, suficiente acá). */
vi.mock("@/lib/solana/scaled-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/solana/scaled-ui")>();
  return { ...actual, fetchMintMultiplier: async () => 1 };
});

/** Cliente de Jupiter: registra la llamada y falla (no hay red en la prueba). */
vi.mock("@/lib/market/jupiter-client", () => ({
  fetchJupiterOrder: async () => {
    state.trace.push("jupiter");
    throw new Error("Jupiter 503");
  },
}));

afterAll(() => {
  for (const [key, value] of envState.saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// ---------------------------------------------------------------------------
// Utilidades de la prueba
// ---------------------------------------------------------------------------

function resetTrace(): void {
  state.trace.length = 0;
}

type RouteReply = { status: number; text: string; payload: Record<string, unknown> };

async function callRoute(
  handler: (req: Request) => Promise<Response>,
  pathname: string,
  body: unknown,
  country?: string,
): Promise<RouteReply> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: SITE,
  };
  if (country) headers["x-vercel-ip-country"] = country;
  const response = await handler(
    new Request(`${SITE}${pathname}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
  // Se serializa el cuerpo COMPLETO: los patrones de infraestructura se buscan
  // sobre el texto tal cual lo recibe el cliente.
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  return { status: response.status, text, payload };
}

function errorOf(reply: RouteReply): { code?: string; message?: string } {
  return (reply.payload.error as { code?: string; message?: string } | undefined) ?? {};
}

/** Patrones que delatan infraestructura: RPC, PostgREST y stack traces. */
const INFRA_PATTERNS: ReadonlyArray<[string, RegExp]> = [
  ["url http(s)", /https?:\/\//i],
  ["rpc mainnet", /api\.mainnet/i],
  ["helius", /helius/i],
  ["quiknode", /quiknode/i],
  ["postgrest", /postgrest/i],
  ["codigo PGRST", /PGRST\d*/i],
  ["tabla cruda", /relation "/i],
  ["permiso", /permission denied/i],
  ["clave duplicada", /duplicate key/i],
  ["stack trace", /\bat\s+\S+\s+\(?[^)]*:\d+:\d+/i],
  ["prefijo Error:", /\bError:\s/],
  ["stack", /stack/i],
];

function expectSanitized(text: string): void {
  expect(text.length).toBeGreaterThan(0);
  for (const [label, pattern] of INFRA_PATTERNS) {
    expect(pattern.test(text), `la respuesta filtra ${label}: ${text}`).toBe(false);
  }
}

const QUOTE_BODY = { side: "buy", symbol: "AAPLx", amount: 10, amountCurrency: "USDC" };
const BUILD_BODY = { quoteId: QUOTE_REQUEST_ID, userPublicKey: ORIGIN };
const SEND_BODY = { to: DESTINATION, mint: USDC_MINT, amountUi: 10, userPublicKey: ORIGIN };
const SUBMIT_BODY = { requestId: "sin-cotizacion", signedTransactionBase64: "ZmlybWE=" };

// ---------------------------------------------------------------------------
// A1) Reintento: un depósito no se acredita dos veces
// ---------------------------------------------------------------------------

function usdcBalance(accountIndex: number, uiAmount: number) {
  return {
    accountIndex,
    mint: USDC_MINT_SOLANA,
    owner: ORIGIN,
    uiTokenAmount: {
      uiAmount,
      amount: String(Math.round(uiAmount * 10 ** USDC_DECIMALS)),
      decimals: USDC_DECIMALS,
    },
  };
}

function txWithDelta(signature: string, beforeUi: number, afterUi: number): ParsedTxLike {
  return {
    meta: {
      err: null,
      preTokenBalances: [usdcBalance(1, beforeUi)],
      postTokenBalances: [usdcBalance(1, afterUi)],
    },
    transaction: { signatures: [signature] },
    blockTime: 1_700_000_000,
  };
}

/** Una sola transacción confirmada por firma, re-entregada como la da el cron. */
function queueConfirmedDeposit(signature: string, beforeUi: number, afterUi: number): void {
  state.scan.signatures = [signature];
  state.scan.txs = [txWithDelta(signature, beforeUi, afterUi)];
  state.scan.statuses = [{ confirmationStatus: "confirmed", slot: 7, confirmations: 1, err: null }];
}

describe("A1: la MISMA firma de depósito no acredita dos veces", () => {
  beforeEach(() => {
    vi.stubEnv("DATA_MODE", "live");
    vi.stubEnv("WALLET_DEPOSIT_SYNC", "on");
    __setFlagReaderForTests(async (key) => key === "deposits_enabled");
    state.cryptoDeposits = [];
    state.depositInsertAttempts = 0;
    state.movements = [];
    state.scan.signatures = [];
    state.scan.txs = [];
    state.scan.statuses = [];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetFlagsForTests();
  });

  it("dos corridas con la misma firma dejan UNA fila, UN movimiento y el monto una sola vez", async () => {
    queueConfirmedDeposit("5depositoRepetido", 10, 35);

    const first = await syncSolanaUsdcDeposits();
    const second = await syncSolanaUsdcDeposits();

    // Escrituras: el libro tiene una sola fila y la actividad una sola entrada.
    expect(state.cryptoDeposits).toHaveLength(1);
    expect(state.movements).toHaveLength(1);
    // La firma se escribió UNA vez: en la segunda corrida el indexador ya la
    // conoce (`knownSignatures`) y ni siquiera llega al INSERT. La clave única
    // de `crypto_deposits` es la segunda red, no la primera.
    expect(state.depositInsertAttempts).toBe(1);
    // Monto total acreditado: 25 USDC una vez, no 50.
    expect(state.cryptoDeposits.reduce((sum, row) => sum + row.amountUi, 0)).toBe(25);
    expect(state.movements.reduce((sum, row) => sum + row.amountUi, 0)).toBe(25);

    // El resumen es honesto: el segundo barrido no cuenta un crédito nuevo.
    expect(first.confirmed).toBe(1);
    expect(second.confirmed).toBe(0);
    expect(second.duplicates).toBeGreaterThanOrEqual(1);
    expect(state.cryptoDeposits[0]?.signature).toBe("5depositoRepetido");
  });
});

// ---------------------------------------------------------------------------
// A2) Reintento de retiro: la validación no es un libro
// ---------------------------------------------------------------------------

describe("A2: el mismo retiro no puede descontar dos veces", () => {
  const params = {
    destinationAddress: DESTINATION,
    sourceAddress: ORIGIN,
    mint: USDC_MINT,
    amountUi: 10,
    availableBalanceUi: 1000,
    realTradingEnabled: true,
  } as const;

  beforeEach(() => {
    __resetRateLimitsForTests();
    resetTrace();
    state.tradeOverride = null;
    state.portfolio.sendBuild.mockReset();
    state.portfolio.balances.mockReset();
    state.portfolio.balances.mockResolvedValue([
      { mint: USDC_MINT, symbol: "USDC", rawAmount: "1000000000", uiAmount: 1000, valueUsd: 1000 },
    ]);
    state.portfolio.sendBuild.mockResolvedValue({
      requestId: "send-prelaunch",
      transactionBase64: "AAAA",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    state.auth.getSession.mockImplementation(async () => ({
      userId: USER,
      walletAddress: null,
    }));
  });

  it("la preparación es pura y con clave de idempotencia la referencia es determinista", () => {
    const key = "retiro-idem-0001";
    const first = validateAndPrepareWithdrawal({ ...params, requestId: key });
    const second = validateAndPrepareWithdrawal({ ...params, requestId: key });
    const other = validateAndPrepareWithdrawal({ ...params, requestId: "retiro-idem-0002" });

    expect(first.ok && second.ok && other.ok).toBe(true);
    if (!first.ok || !second.ok || !other.ok) throw new Error("la preparación válida falló");

    // Preparar no debita nada: no se llamó al servicio de envío.
    expect(state.portfolio.sendBuild).not.toHaveBeenCalled();
    expect(first.preparation.amountUi).toBe(10);

    // T41: la misma clave produce la MISMA referencia; otra clave, otra.
    expect(first.preparation.reference).toBe(second.preparation.reference);
    expect(first.preparation.reference).toContain(key);
    expect(other.preparation.reference).not.toBe(first.preparation.reference);

    // Sin clave se conserva el identificador único por llamada.
    const loose = validateAndPrepareWithdrawal({ ...params });
    const looseAgain = validateAndPrepareWithdrawal({ ...params });
    expect(loose.ok && looseAgain.ok).toBe(true);
    if (!loose.ok || !looseAgain.ok) throw new Error("la preparación sin clave falló");
    expect(loose.preparation.reference).not.toBe(looseAgain.preparation.reference);

    // Una clave malformada se rechaza, no se ignora en silencio.
    const bad = validateAndPrepareWithdrawal({ ...params, requestId: "corta" });
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error("una clave inválida no puede pasar");
    expect(bad.code).toBe("VALIDATION");
  });

  it("el MISMO retiro reintentado no abre una segunda salida en el libro", async () => {
    const key = "retiro-idem-0001";
    const body = { ...SEND_BODY, requestId: key };
    const first = await callRoute(postSendBuild, "/api/wallet/send/build", body);
    const second = await callRoute(postSendBuild, "/api/wallet/send/build", body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(state.portfolio.sendBuild).toHaveBeenCalledTimes(2);

    const callA = state.portfolio.sendBuild.mock.calls[0]?.[0] as { reference?: string } | undefined;
    const callB = state.portfolio.sendBuild.mock.calls[1]?.[0] as { reference?: string } | undefined;
    // La referencia determinista viaja al servicio en los dos intentos: el
    // débito se registra con UNA sola clave, no con un UUID nuevo por reintento.
    expect(callA?.reference).toBe(`withdraw:${ORIGIN}:${USDC_MINT}:${key}`);
    expect(callB?.reference).toBe(callA?.reference);

    // El libro es `wallet_movements.reference` UNIQUE (0030): la primera
    // escritura entra y el reintento choca. Un solo débito, no dos.
    const ledger = new Set<string>();
    const debit = (reference: string): boolean => {
      if (ledger.has(reference)) return false;
      ledger.add(reference);
      return true;
    };
    expect(debit(String(callA?.reference))).toBe(true);
    expect(debit(String(callB?.reference))).toBe(false);
    expect(ledger.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// A3) Reintento de compra por la ruta real de submit
// ---------------------------------------------------------------------------

/** Almacén de cupo mínimo con la semántica de 0042 (una reserva por operación). */
function makeReservationStore(): {
  store: ReservationStore;
  rows: Map<string, ReservationRecord>;
} {
  const rows = new Map<string, ReservationRecord>();
  const keyOf = (userId: string, requestId: string) => `${userId}|${requestId}`;
  const store: ReservationStore = {
    async reserve(input) {
      const key = keyOf(input.userId, input.requestId);
      if (rows.has(key)) throw new Error("MV_RESERVATION_CONFLICT");
      const row: ReservationRecord = {
        id: input.requestId,
        amountUsd: input.amountUsd,
        expiresAt: input.expiresAt,
        status: "reserved" as ReservationStatus,
      };
      rows.set(key, row);
      return row;
    },
    async consume(userId, requestId) {
      const row = rows.get(keyOf(userId, requestId));
      if (!row || row.status !== "reserved") return false;
      row.status = "consumed";
      return true;
    },
    async release(userId, requestId) {
      const row = rows.get(keyOf(userId, requestId));
      if (!row || row.status !== "reserved") return false;
      row.status = "released";
      return true;
    },
    async read(userId, requestId) {
      return rows.get(keyOf(userId, requestId)) ?? null;
    },
    async releaseOthers(userId, keepRequestId) {
      let released = 0;
      for (const [key, row] of rows) {
        if (!key.startsWith(`${userId}|`)) continue;
        if (row.status === "reserved" && row.id !== keepRequestId) {
          row.status = "released";
          released += 1;
        }
      }
      return released;
    },
  };
  return { store, rows };
}

/** Almacén de la cotización: cuelga de la reserva y se arma UNA sola vez. */
function makeQuoteStore(reservations: Map<string, ReservationRecord>): LiveQuoteStore {
  const rows = new Map<
    string,
    { payload: LiveQuotePayload; status: LiveQuoteStatus; reservationExpiresAt: string }
  >();
  return {
    async saveQuote(input) {
      const key = `${input.userId}|${input.requestId}`;
      const reservation = reservations.get(key);
      if (!reservation || reservation.status !== "reserved") throw new Error("MV_QUOTE_MISSING");
      if (rows.has(key)) throw new Error("MV_QUOTE_EXISTS");
      rows.set(key, {
        payload: input.payload,
        status: "reserved",
        reservationExpiresAt: reservation.expiresAt,
      });
    },
    async readQuote(userId, requestId) {
      const key = `${userId}|${requestId}`;
      const row = rows.get(key);
      if (!row) return null;
      const reservation = reservations.get(key);
      return {
        payload: row.payload,
        status: reservation?.status ?? row.status,
        reservationExpiresAt: row.reservationExpiresAt,
      };
    },
    async claimBuild(userId, requestId) {
      const row = rows.get(`${userId}|${requestId}`);
      if (!row || row.payload.built) return false;
      row.payload = { ...row.payload, built: true };
      return true;
    },
    async recordBuilt(userId, requestId, patch) {
      const row = rows.get(`${userId}|${requestId}`);
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
}

/**
 * Transacción base64 que `assertSignedTransactionMatchesBuilt` puede leer. Se
 * usa la MISMA en `built` y en `signed` porque lo que se compara es el mensaje
 * (lo que el usuario firmó), no la firma.
 */
async function transactionBase64(): Promise<string> {
  const web3 = await import("@solana/web3.js");
  const payer = web3.Keypair.generate();
  const tx = new web3.Transaction({
    feePayer: payer.publicKey,
    recentBlockhash: "11111111111111111111111111111111",
  });
  tx.add(
    web3.SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: web3.Keypair.generate().publicKey,
      lamports: 1,
    }),
  );
  const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  return Buffer.from(bytes).toString("base64");
}

async function makeLiveTradeWithBuiltQuote(): Promise<{
  trade: ReturnType<typeof createLiveTrade>;
  signedTransactionBase64: string;
}> {
  const reservations = makeReservationStore();
  const quotes = makeQuoteStore(reservations.rows);
  const deps = { reservations: reservations.store, quotes };
  const signedTransactionBase64 = await transactionBase64();

  // Cotización real guardada con las funciones de producción (reserva +
  // payload) y armada una sola vez, como la deja `build`.
  await saveQuotedTrade(deps, {
    userId: USER,
    amountUsd: 100,
    reservationExpiresAt: new Date(Date.now() + 120_000).toISOString(),
    payload: {
      version: LIVE_QUOTE_VERSION,
      requestId: QUOTE_REQUEST_ID,
      side: "buy",
      symbol: "AAPLx",
      mint: STOCK_MINT,
      inputMint: USDC_MINT,
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
    },
  });
  await claimQuotedTradeBuild(deps, USER, QUOTE_REQUEST_ID);
  await recordQuotedTradeBuild(deps, USER, QUOTE_REQUEST_ID, {
    inAmountUi: 100,
    outAmountUi: 0.4,
    priceUsd: 250,
    builtTransactionBase64: signedTransactionBase64,
  });

  return { trade: createLiveTrade(deps), signedTransactionBase64 };
}

/** Red simulada de `/swap/v2/execute`: registra la llamada y responde según el caso. */
function stubExecuteFetch(outcome: "ok" | "network-error", raw = ""): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes("/swap/v2/execute")) throw new Error("red no disponible en la prueba");
      state.trace.push("execute");
      state.executeCalls += 1;
      if (outcome === "network-error") throw new Error(raw);
      return Response.json({ status: "Success", signature: "sig-ejecutada" });
    }),
  );
}

describe("A3: el MISMO submit no descuenta ni ejecuta dos veces", () => {
  beforeEach(() => {
    state.orders.clear();
    state.executeCalls = 0;
    resetTrace();
    state.auth.getSession.mockImplementation(async () => ({
      userId: USER,
      walletAddress: null,
    }));
  });

  afterEach(() => {
    state.tradeOverride = null;
    vi.unstubAllGlobals();
  });

  it("dos POST /api/trade/submit con el mismo requestId crean UNA orden y ejecutan UNA vez", async () => {
    const { trade, signedTransactionBase64 } = await makeLiveTradeWithBuiltQuote();
    state.tradeOverride = trade as unknown as Record<string, unknown>;
    stubExecuteFetch("ok");
    const body = { requestId: QUOTE_REQUEST_ID, signedTransactionBase64 };

    const first = await callRoute(postSubmit, "/api/trade/submit", body);
    const second = await callRoute(postSubmit, "/api/trade/submit", body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // Una sola fila en `orders` y una sola llamada a `/swap/v2/execute`: el
    // reintento devuelve la MISMA orden en vez de ejecutar otra compra.
    expect(state.orders.size).toBe(1);
    expect(state.executeCalls).toBe(1);
    const firstData = first.payload.data as { orderId: string; status: string; signature: string };
    const secondData = second.payload.data as { orderId: string; status: string; signature: string };
    expect(firstData.orderId).toBe(secondData.orderId);
    expect(secondData.status).toBe("submitted");
    // El dinero se descuenta una vez: la única orden es la de la primera firma.
    expect([...state.orders.values()].map((order) => order.id)).toEqual([firstData.orderId]);
    // Y el geobloqueo corrió antes de cada ejecución (orden real de la ruta).
    expect(state.trace).toEqual(["geo", "execute", "geo"]);
  });
});

// ---------------------------------------------------------------------------
// B) País bloqueado: 403 GEO_BLOCKED antes del proveedor
// ---------------------------------------------------------------------------

type RouteCase = {
  name: string;
  handler: (req: Request) => Promise<Response>;
  pathname: string;
  body: unknown;
};

function routeCases(): RouteCase[] {
  return [
    {
      name: "POST /api/trade/quote",
      handler: postQuote,
      pathname: "/api/trade/quote",
      body: QUOTE_BODY,
    },
    {
      name: "POST /api/trade/build",
      handler: postBuild,
      pathname: "/api/trade/build",
      body: BUILD_BODY,
    },
    {
      name: "POST /api/trade/submit",
      handler: postSubmit,
      pathname: "/api/trade/submit",
      body: SUBMIT_BODY,
    },
    {
      name: "POST /api/wallet/send/build",
      handler: postSendBuild,
      pathname: "/api/wallet/send/build",
      body: SEND_BODY,
    },
  ];
}

describe("B: geobloqueo antes del proveedor y respuesta saneada", () => {
  beforeEach(() => {
    __resetRateLimitsForTests();
    state.trade.quote.mockReset();
    state.trade.build.mockReset();
    state.trade.submit.mockReset();
    state.portfolio.sendBuild.mockReset();
    state.portfolio.balances.mockReset();
    state.tradeOverride = null;
    state.executeCalls = 0;
    resetTrace();
    state.auth.getSession.mockImplementation(async () => ({
      userId: USER,
      walletAddress: null,
    }));
    // Los servicios registran su llamada y fallan: lo que se mide es si
    // llegaron a ejecutarse y en qué orden respecto del geobloqueo.
    for (const fn of [state.trade.quote, state.trade.build, state.trade.submit]) {
      fn.mockImplementation(async () => {
        state.trace.push("servicio");
        throw new Error("fallo del servicio");
      });
    }
    state.portfolio.balances.mockResolvedValue([
      { mint: USDC_MINT, symbol: "USDC", rawAmount: "1000000000", uiAmount: 1000, valueUsd: 1000 },
    ]);
    state.portfolio.sendBuild.mockImplementation(async () => {
      state.trace.push("sendBuild");
      throw new Error("fallo del servicio");
    });
  });

  it("las cuatro rutas geobloqueadas responden 403 GEO_BLOCKED sin llamar al proveedor", async () => {
    for (const route of routeCases()) {
      resetTrace();
      // EE.UU. está en la lista base de `config/compliance.ts` (no se inventa).
      const reply = await callRoute(route.handler, route.pathname, route.body, "US");

      expect(reply.status, route.name).toBe(403);
      expect(errorOf(reply).code, route.name).toBe("GEO_BLOCKED");
      // La traza sólo tiene el geobloqueo: Jupiter/build/submit/sendBuild no
      // llegaron a ejecutarse (tampoco se parseó el cuerpo).
      expect(state.trace, route.name).toEqual(["geo"]);
      expect(state.trade.quote.mock.calls.length, route.name).toBe(0);
      expect(state.trade.build.mock.calls.length, route.name).toBe(0);
      expect(state.trade.submit.mock.calls.length, route.name).toBe(0);
      expect(state.portfolio.sendBuild.mock.calls.length, route.name).toBe(0);
      // El mensaje es el humano de compliance, no un detalle interno.
      expect(errorOf(reply).message, route.name).toMatch(/no podemos ofrecer/i);
    }
  });

  it("con país permitido el geobloqueo corre ANTES del proveedor (orden registrado)", async () => {
    // quote: motor real → el cliente de Jupiter registra "jupiter" y falla.
    const { trade } = await makeLiveTradeWithBuiltQuote();
    state.tradeOverride = trade as unknown as Record<string, unknown>;
    resetTrace();
    const quote = await callRoute(postQuote, "/api/trade/quote", QUOTE_BODY, "CL");
    expect(quote.status).toBe(502);
    expect(state.trace).toEqual(["geo", "jupiter"]);

    // build y submit: el servicio inyectado registra su llamada después del geo.
    state.tradeOverride = null;
    resetTrace();
    const build = await callRoute(postBuild, "/api/trade/build", BUILD_BODY, "CL");
    expect(build.status).toBe(500);
    expect(state.trace).toEqual(["geo", "servicio"]);

    resetTrace();
    const submit = await callRoute(postSubmit, "/api/trade/submit", SUBMIT_BODY, "CL");
    expect(submit.status).toBe(500);
    expect(state.trace).toEqual(["geo", "servicio"]);

    // wallet/send/build: la salida no se arma sin pasar por el geobloqueo.
    resetTrace();
    const send = await callRoute(postSendBuild, "/api/wallet/send/build", SEND_BODY, "CL");
    expect(send.status).toBe(500);
    expect(state.trace).toEqual(["geo", "sendBuild"]);
    expect(state.portfolio.sendBuild).toHaveBeenCalledTimes(1);
  });

  it("un fallo crudo del servicio no filtra infraestructura en el JSON", async () => {
    const RAW =
      'PostgrestError: relation "orders" does not exist (PGRST116) ' +
      "https://api.mainnet-beta.solana.com/rpc permission denied for table orders " +
      'duplicate key value violates unique constraint "orders_request_id_key"';

    // El servicio (Supabase/Jupiter/el motor) revienta con el error crudo.
    for (const fn of [
      state.trade.quote,
      state.trade.build,
      state.trade.submit,
      state.portfolio.sendBuild,
    ]) {
      fn.mockReset();
      fn.mockImplementation(async () => {
        throw new Error(RAW);
      });
    }

    for (const route of routeCases()) {
      __resetRateLimitsForTests();
      resetTrace();
      const reply = await callRoute(route.handler, route.pathname, route.body, "CL");

      // El detalle queda en el log del servidor; al cliente le llega un
      // INTERNAL genérico con `requestId`.
      expect(reply.status, route.name).toBe(500);
      expect(errorOf(reply).code, route.name).toBe("INTERNAL");
      expect(errorOf(reply).message, route.name).toBe("Error interno.");
      expect(typeof reply.payload.requestId, route.name).toBe("string");
      expectSanitized(reply.text);
      expect(reply.text, route.name).not.toContain("orders_request_id_key");
      expect(reply.text, route.name).not.toContain("mainnet");
    }
  });

  it("el 502 de submit NO filtra la URL del RPC ni el texto crudo de PostgREST", async () => {
    // `trade.live.submit` envuelve la caída del proveedor en un
    // DomainError(UPSTREAM). T41: el mensaje crudo queda en el log y al cliente
    // le llega un texto humano, sin URL, sin PostgREST y sin la tabla.
    const RAW =
      'request to https://api.mainnet-beta.solana.com/ failed: PostgrestError ' +
      'relation "orders" does not exist (PGRST116)';
    const { trade, signedTransactionBase64 } = await makeLiveTradeWithBuiltQuote();
    state.orders.clear();
    resetTrace();
    state.tradeOverride = trade as unknown as Record<string, unknown>;
    stubExecuteFetch("network-error", RAW);

    try {
      const reply = await callRoute(
        postSubmit,
        "/api/trade/submit",
        { requestId: QUOTE_REQUEST_ID, signedTransactionBase64 },
        "CL",
      );

      expect(reply.status).toBe(502);
      expect(errorOf(reply).code).toBe("UPSTREAM");
      expect(reply.text).not.toContain("api.mainnet-beta.solana.com");
      expect(reply.text).not.toContain("PostgrestError");
      expect(reply.text).not.toContain("PGRST116");
      expect(reply.text).not.toContain("relation \"orders\"");
      expect(reply.text).not.toContain("https://");
      // La incertidumbre sí se le dice al cliente: la tx pudo haber salido.
      expect(errorOf(reply).message).toContain("No pudimos enviar la operación");
      expect(errorOf(reply).message).toContain("revisa el estado");
    } finally {
      state.tradeOverride = null;
      vi.unstubAllGlobals();
    }
  });
});

// ---------------------------------------------------------------------------
// El candado no se abrió en el código: sólo se mockeó en esta prueba
// ---------------------------------------------------------------------------

describe("B: el candado de producción sigue cerrado", () => {
  it("real-guards conserva REAL_EXECUTION_LOCKED en true y la guardia lanza 503", async () => {
    const actual = await vi.importActual<typeof import("@/lib/trade/real-guards")>(
      "@/lib/trade/real-guards",
    );
    expect(actual.REAL_EXECUTION_LOCKED).toBe(true);
    // La guardia real sigue lanzando REAL_DISABLED: el candado no se abrió.
    expect(() => actual.assertRealExecutionLocked()).toThrow(
      expect.objectContaining({ code: "REAL_DISABLED" }),
    );
  });
});
