import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  type MessageV0,
} from "@solana/web3.js";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getStatusRoute } from "@/app/api/wallet/send/status/route";
import { POST as postSubmitRoute } from "@/app/api/wallet/send/submit/route";
import { USDC_MINT } from "@/config/tickers";
import { httpStatusFor } from "@/lib/api/result";
import { __resetRateLimitsForTests } from "@/lib/security/rate-limit";
import { encodeBase58 } from "@/lib/solana/address";
import type { SignatureStatusLike } from "@/lib/solana/signature-status";
import {
  createInMemoryWithdrawalStore,
  getWithdrawalStatus,
  setWithdrawalStoreForTests,
  submitWithdrawal,
  type ClaimWithdrawalResult,
  type ReserveWithdrawalInput,
  type WithdrawalStatus,
  type WithdrawalStore,
} from "@/lib/wallet/withdrawal-store";

/**
 * T42: libro de retiros (auditoría D-02) — reserva, envío y estado.
 *
 * Lo que se prueba acá es el dinero que SALE, y los tres agujeros que el libro
 * cierra: (1) sin topes sumados por día/mes, partir un monto en diez envíos
 * vaciaba la cuenta; (2) sin idempotencia, un reintento del cliente transmitía
 * dos veces la misma firma; (3) sin registro antes de transmitir, un RPC
 * ambiguo dejaba una salida real sin rastro auditable.
 *
 * Criterio de las pruebas:
 * - Las transacciones son REALES (`Keypair`, `TransactionMessage` v0,
 *   `SystemProgram.transfer`): la comparación mensaje-armado/mensaje-firmado
 *   que hace `lib/trade/integrity.ts` sólo es significativa con bytes de verdad.
 * - Nada de red ni de Supabase: el RPC entra por deps inyectadas y en las rutas
 *   por un `getServerConnection` falso que sirve de alambre-trampa (si alguien
 *   toca la cadena, la prueba lo ve).
 * - El candado de ejecución real se abre SÓLO por mock y por test, para mirar lo
 *   que vive detrás de la compuerta; el valor REAL exportado sigue en `true` y
 *   eso se comprueba con `vi.importActual`.
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
  const values: Record<string, string> = {
    // DATA_MODE=live es el escenario real: con mock la rama de retiro no existe
    // y las pruebas no dirían nada del camino que mueve plata.
    DATA_MODE: "live",
    AUTH_MODE: "supabase",
    NEXT_PUBLIC_AUTH_MODE: "supabase",
    NEXT_PUBLIC_DATA_MODE: "live",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
    NEXT_PUBLIC_SITE_URL: "https://maverlang.test",
    REAL_TRADING_READY: "true",
  };
  const saved = new Map<string, string | undefined>();
  for (const key of keys) {
    saved.set(key, process.env[key]);
    process.env[key] = values[key] as string;
  }
  return { saved };
});

/** Sesión verificada de la prueba (sin Supabase real). */
const session = vi.hoisted(() => ({
  userId: "11111111-1111-4111-8111-111111111111",
  walletAddress: "11111111111111111111111111111111",
}));

/**
 * Candado por test. El mock NO reimplementa la guardia: cuando `locked` es true
 * delega en la función real, así el 503 REAL_DISABLED y su código los sigue
 * produciendo el código de producción.
 */
const guardState = vi.hoisted(() => ({ locked: false }));

/** Alambre-trampa del RPC: si una ruta bloqueada lo toca, la prueba falla. */
const rpc = vi.hoisted(() => ({
  sendRawTransaction: vi.fn<(rawTx: Uint8Array) => Promise<string>>(),
  getSignatureStatuses: vi.fn<
    (sigs: string[]) => Promise<{ value: Array<SignatureStatusLike | null> }>
  >(),
}));

vi.mock("@/lib/services", () => ({
  getServices: () => ({
    auth: {
      getSession: async () => ({ userId: session.userId, walletAddress: session.walletAddress }),
    },
    portfolio: {
      sendBuild: async () => {
        throw new Error("T42: la ruta de submit no arma transacciones");
      },
      balances: async () => [],
    },
    trade: {
      submit: async () => {
        throw new Error("T42: con sesión Supabase el envío va por el libro de retiros");
      },
      status: async () => {
        throw new Error("T42: con sesión Supabase el estado va por el libro de retiros");
      },
    },
  }),
}));

vi.mock("@/lib/trade/real-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/trade/real-guards")>();
  return {
    ...actual,
    assertRealExecutionLocked: () => {
      if (guardState.locked) actual.assertRealExecutionLocked();
    },
    // El kill switch de salidas se abre junto con el candado: acá interesa lo
    // que hay detrás, no el flag del panel (que tiene su propia prueba en T35).
    assertRealWithdrawalsEnabled: async () => {
      if (guardState.locked) actual.assertRealExecutionLocked();
    },
  };
});

vi.mock("@/lib/solana/connection", () => ({ getServerConnection: () => rpc }));

afterAll(() => {
  for (const [key, value] of envState.saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const SITE = "https://maverlang.test";
const USER = session.userId;
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const ORIGIN = session.walletAddress;
const DESTINATION = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const STOCK_MINT = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
/** Blockhash de 32 bytes en cero: no se transmite, sólo se firma. */
const RECENT_BLOCKHASH = "11111111111111111111111111111111";

/** Pagador de las transacciones de prueba: firmas reales, sin red. */
const PAYER = Keypair.generate();

type SubmitDeps = NonNullable<Parameters<typeof submitWithdrawal>[1]>;
type MovementRow = Parameters<NonNullable<SubmitDeps["upsertMovement"]>>[0];
type StatusDeps = NonNullable<Parameters<typeof getWithdrawalStatus>[1]>;
type SignatureStatusesResult = Awaited<
  ReturnType<NonNullable<StatusDeps["getSignatureStatuses"]>>
>;

// ---------------------------------------------------------------------------
// Transacciones reales de Solana (sin red)
// ---------------------------------------------------------------------------

/**
 * Mensaje v0 con una transferencia de lamports. El destinatario y el monto son
 * los dos campos que un cliente malicioso podría cambiar con un `requestId`
 * ajeno; por eso los casos de "mensaje alterado" los tocan por separado.
 */
function withdrawalMessage(destination: string, lamports: number): MessageV0 {
  return new TransactionMessage({
    payerKey: PAYER.publicKey,
    recentBlockhash: RECENT_BLOCKHASH,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: PAYER.publicKey,
        toPubkey: new PublicKey(destination),
        lamports,
      }),
    ],
  }).compileToV0Message();
}

function signedTransaction(message: MessageV0): { base64: string; signature: string } {
  const transaction = new VersionedTransaction(message);
  transaction.sign([PAYER]);
  const signature = transaction.signatures[0];
  if (!signature) throw new Error("La transacción no trae firma");
  return {
    base64: Buffer.from(transaction.serialize()).toString("base64"),
    signature: encodeBase58(signature),
  };
}

/**
 * Misma transacción sin firmar: `VersionedTransaction` rellena las firmas con
 * 64 bytes en cero, que es exactamente lo que `readTransactionSignature`
 * descarta. Una tx "firmada" con ceros no es evidencia de nada.
 */
function unsignedTransaction(message: MessageV0): string {
  return Buffer.from(new VersionedTransaction(message).serialize()).toString("base64");
}

const BASE_TX = signedTransaction(withdrawalMessage(DESTINATION, 1_000_000));
const BASE_TX_BASE64 = BASE_TX.base64;
/** Firma real y reutilizable para las reservas que sólo necesitan un envío. */
const BASE_SIGNATURE = BASE_TX.signature;

// ---------------------------------------------------------------------------
// Fixtures del libro
// ---------------------------------------------------------------------------

type WithdrawalFixture = {
  input: ReserveWithdrawalInput;
  message: MessageV0;
  signedBase64: string;
  signature: string;
};

function withdrawalFixture(overrides: Partial<ReserveWithdrawalInput> = {}): WithdrawalFixture {
  const requestId = overrides.requestId ?? "req-t42";
  const message = withdrawalMessage(DESTINATION, 1_000_000);
  const signed = signedTransaction(message);
  const input: ReserveWithdrawalInput = {
    userId: USER,
    requestId,
    reference: `withdraw:${USDC_MINT}:25:${requestId}`,
    mint: USDC_MINT,
    symbol: "USDC",
    sourceAddress: ORIGIN,
    destinationAddress: DESTINATION,
    amountUi: 25,
    amountUsd: 25,
    builtTransactionBase64: signed.base64,
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    ...overrides,
  };
  return { input, message, signedBase64: signed.base64, signature: signed.signature };
}

/** Reserva mínima para las pruebas de topes: sólo importan monto y clave. */
function limitInput(requestId: string, amountUsd: number): ReserveWithdrawalInput {
  return {
    userId: USER,
    requestId,
    reference: `withdraw:${USDC_MINT}:${amountUsd}:${requestId}`,
    mint: USDC_MINT,
    symbol: "USDC",
    sourceAddress: ORIGIN,
    destinationAddress: DESTINATION,
    amountUi: amountUsd,
    amountUsd,
    builtTransactionBase64: BASE_TX_BASE64,
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  };
}

/** Reserva que ya se envió: es la que consumió cupo de verdad. */
async function seedSubmitted(store: WithdrawalStore, fixture: WithdrawalFixture): Promise<void> {
  await store.reserve(fixture.input);
  await store.claimSubmit(fixture.input.userId, fixture.input.requestId, fixture.signature);
}

/** Store en memoria con espías: permite afirmar que NO se tocó. */
function spyStore(base: WithdrawalStore) {
  const reserve = vi.fn((input: ReserveWithdrawalInput) => base.reserve(input));
  const claimSubmit = vi.fn(
    (userId: string, requestId: string, signature: string): Promise<ClaimWithdrawalResult | null> =>
      base.claimSubmit(userId, requestId, signature),
  );
  const finalize = vi.fn(
    (
      userId: string,
      requestId: string,
      status: WithdrawalStatus,
      signature?: string | null,
      error?: string | null,
    ) => base.finalize(userId, requestId, status, signature, error),
  );
  const read = vi.fn((userId: string, requestId: string) => base.read(userId, requestId));

  const store: WithdrawalStore = { reserve, claimSubmit, finalize, read };
  return { store, reserve, claimSubmit, finalize, read };
}

// ---------------------------------------------------------------------------
// Rutas HTTP
// ---------------------------------------------------------------------------

type Reply = {
  status: number;
  payload: { ok?: boolean; error?: { code?: string; message?: string } };
};

async function replyOf(response: Response): Promise<Reply> {
  const payload = (await response.json()) as Reply["payload"];
  return { status: response.status, payload };
}

function submitRequest(body: unknown, country?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: SITE,
  };
  if (country) headers["x-vercel-ip-country"] = country;
  return new Request(`${SITE}/api/wallet/send/submit`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function statusRequest(id: string, country?: string): Request {
  const headers: Record<string, string> = { origin: SITE };
  if (country) headers["x-vercel-ip-country"] = country;
  return new Request(`${SITE}/api/wallet/send/status?id=${encodeURIComponent(id)}`, {
    method: "GET",
    headers,
  });
}

beforeEach(() => {
  // Cada caso arranca con el candado cerrado por mock (abierto para mirar
  // detrás de la compuerta), sin store inyectado de otro test y con los cupos
  // de rate limit en cero.
  setWithdrawalStoreForTests(null);
  guardState.locked = false;
  __resetRateLimitsForTests();
  rpc.sendRawTransaction.mockReset();
  rpc.getSignatureStatuses.mockReset();
  rpc.sendRawTransaction.mockResolvedValue("firma-rpc-no-usada");
  rpc.getSignatureStatuses.mockResolvedValue({ value: [] });
});

afterEach(() => {
  setWithdrawalStoreForTests(null);
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// 1. La compuerta de dinero real sigue cerrada y precede a todo
// ---------------------------------------------------------------------------

describe("T42: el candado real corta la salida antes del libro y del RPC", () => {
  it("POST /api/wallet/send/submit con el candado cerrado responde 503 sin tocar libro ni RPC", async () => {
    guardState.locked = true;
    const spies = spyStore(createInMemoryWithdrawalStore());
    setWithdrawalStoreForTests(spies.store);
    const fixture = withdrawalFixture();

    const reply = await replyOf(
      await postSubmitRoute(
        submitRequest({
          requestId: fixture.input.requestId,
          signedTransactionBase64: fixture.signedBase64,
        }),
      ),
    );

    expect(reply.status).toBe(503);
    expect(reply.payload.error?.code).toBe("REAL_DISABLED");
    // La firma ya viene del cliente: si la ruta la transmitiera con el candado
    // cerrado, el bloqueo no serviría de nada.
    expect(spies.reserve).not.toHaveBeenCalled();
    expect(spies.claimSubmit).not.toHaveBeenCalled();
    expect(spies.finalize).not.toHaveBeenCalled();
    expect(spies.read).not.toHaveBeenCalled();
    expect(rpc.sendRawTransaction).not.toHaveBeenCalled();
    expect(rpc.getSignatureStatuses).not.toHaveBeenCalled();
  });

  it("GET /api/wallet/send/status con el candado cerrado responde 503 sin leer el libro", async () => {
    guardState.locked = true;
    const spies = spyStore(createInMemoryWithdrawalStore());
    setWithdrawalStoreForTests(spies.store);

    // Leer el estado ya revela qué se armó, para qué monto y a qué destino: la
    // compuerta tiene que tapar también la lectura, no sólo el envío.
    const reply = await replyOf(await getStatusRoute(statusRequest("wdr_mem_1")));

    expect(reply.status).toBe(503);
    expect(reply.payload.error?.code).toBe("REAL_DISABLED");
    expect(spies.read).not.toHaveBeenCalled();
    expect(rpc.getSignatureStatuses).not.toHaveBeenCalled();
  });

  it("el valor REAL exportado de REAL_EXECUTION_LOCKED sigue siendo true", async () => {
    const actual = await vi.importActual<typeof import("@/lib/trade/real-guards")>(
      "@/lib/trade/real-guards",
    );

    expect(actual.REAL_EXECUTION_LOCKED).toBe(true);

    let code: string | null = null;
    try {
      actual.assertRealExecutionLocked();
    } catch (error) {
      code = (error as { code?: string }).code ?? null;
    }
    expect(code).toBe("REAL_DISABLED");
  });
});

// ---------------------------------------------------------------------------
// 2. Geobloqueo: el país se decide antes de mirar el cuerpo o la firma
// ---------------------------------------------------------------------------

describe("T42: el geobloqueo frena la salida antes del libro", () => {
  it("un retiro desde Estados Unidos responde 403 GEO_BLOCKED sin tocar libro ni RPC", async () => {
    // Aun con el candado abierto, el país bloqueado corta primero: exponer el
    // libro de retiros a una IP de EE.UU. ya sería ofrecer el servicio.
    const spies = spyStore(createInMemoryWithdrawalStore());
    setWithdrawalStoreForTests(spies.store);
    const fixture = withdrawalFixture();

    const reply = await replyOf(
      await postSubmitRoute(
        submitRequest(
          { requestId: fixture.input.requestId, signedTransactionBase64: fixture.signedBase64 },
          "US",
        ),
      ),
    );

    expect(reply.status).toBe(403);
    // Mismo código que el resto de las rutas de operación (SEC-02).
    expect(reply.payload.error?.code).toBe("GEO_BLOCKED");
    expect(spies.reserve).not.toHaveBeenCalled();
    expect(spies.claimSubmit).not.toHaveBeenCalled();
    expect(spies.read).not.toHaveBeenCalled();
    expect(rpc.sendRawTransaction).not.toHaveBeenCalled();
  });

  it("un retiro desde Chile pasa el geobloqueo y llega al libro", async () => {
    const spies = spyStore(createInMemoryWithdrawalStore());
    setWithdrawalStoreForTests(spies.store);
    const fixture = withdrawalFixture();

    const reply = await replyOf(
      await postSubmitRoute(
        submitRequest(
          { requestId: fixture.input.requestId, signedTransactionBase64: fixture.signedBase64 },
          "CL",
        ),
      ),
    );

    // No hay retiro reservado con ese requestId: el rechazo es del libro, no de
    // la geocerca. Si el geo hubiera cortado, el código sería GEO_BLOCKED.
    expect(reply.status).toBe(404);
    expect(reply.payload.error?.code).toBe("NOT_FOUND");
    expect(spies.read).toHaveBeenCalledWith(USER, fixture.input.requestId);
    expect(rpc.sendRawTransaction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Topes del libro: operación, día y mes; y una sola reserva viva
// ---------------------------------------------------------------------------

describe("T42: topes del libro de retiros", () => {
  it("el tope por operación es US$500 y deja pasar exactamente US$500", async () => {
    const store = createInMemoryWithdrawalStore();

    await expect(store.reserve(limitInput("req-orden-mal", 500.01))).rejects.toThrow(
      /MV_LIMIT_ORDER/,
    );
    // El borde también se prueba: un tope que rechaza su propio límite es un
    // error de redondeo que dejaría al usuario sin poder retirar el máximo.
    const exact = await store.reserve(limitInput("req-orden-ok", 500));
    expect(typeof exact.id).toBe("string");
  });

  it("el tope diario de US$500 corta la segunda salida del día", async () => {
    // El día se cuenta por ventana (UTC en el store en memoria). El reloj se
    // fija para que la prueba no dependa de la hora en que corre.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-02T15:00:00.000Z"));
    const store = createInMemoryWithdrawalStore();

    // Dos reservas de 400 no se apilan (la nueva libera la anterior), así que
    // para gastar cupo real hay que reclamar el envío.
    await store.reserve(limitInput("req-dia-a", 400));
    await store.reserve(limitInput("req-dia-b", 400));
    await store.claimSubmit(USER, "req-dia-b", BASE_SIGNATURE);

    await expect(store.reserve(limitInput("req-dia-c", 200))).rejects.toThrow(/MV_LIMIT_DAILY/);
  });

  it("el tope mensual de US$2.000 corta la salida que lo supera", async () => {
    // Sólo se puede gastar US$500 por día, así que el tope mensual se alcanza
    // en días distintos: se falsea el reloj (sólo `Date`) para no esperar.
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = createInMemoryWithdrawalStore();

    const days = ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05"];
    for (const [index, day] of days.entries()) {
      vi.setSystemTime(new Date(`${day}T15:00:00.000Z`));
      const requestId = `req-mes-${index}`;
      await store.reserve(limitInput(requestId, 500));
      await store.claimSubmit(USER, requestId, BASE_SIGNATURE);
    }

    vi.setSystemTime(new Date("2026-03-06T15:00:00.000Z"));
    // 2.000 ya salieron; 100 más rompen el mes y no el día.
    await expect(store.reserve(limitInput("req-mes-5", 100))).rejects.toThrow(/MV_LIMIT_MONTHLY/);
  });

  it("una reserva nueva libera la anterior del mismo usuario en vez de apilar topes", async () => {
    const store = createInMemoryWithdrawalStore();

    const first = await store.reserve(limitInput("req-libre-a", 400));
    const second = await store.reserve(limitInput("req-libre-b", 400));

    // Dos de 400 el mismo día superarían el tope diario si se sumaran: pasan
    // porque la anterior queda liberada, no porque el tope no exista.
    expect(second.id).not.toBe(first.id);
    expect((await store.read(USER, "req-libre-a"))?.status).toBe("released");
    expect((await store.read(USER, "req-libre-b"))?.status).toBe("reserved");
  });
});

// ---------------------------------------------------------------------------
// 4. Envío: se reclama una vez, se registra ANTES de transmitir
// ---------------------------------------------------------------------------

describe("T42: submitWithdrawal registra y transmite en el orden correcto", () => {
  it("una tx firmada que coincide con la armada se registra en pending y se envía una vez", async () => {
    const store = createInMemoryWithdrawalStore();
    const fixture = withdrawalFixture();
    await store.reserve(fixture.input);

    const sendRawTransaction = vi.fn(async (_rawTx: Uint8Array) => fixture.signature);
    const movements: MovementRow[] = [];
    const upsertMovement = vi.fn(async (row: MovementRow) => {
      movements.push(row);
      return true;
    });

    const result = await submitWithdrawal(
      {
        userId: USER,
        requestId: fixture.input.requestId,
        signedTransactionBase64: fixture.signedBase64,
      },
      { store, sendRawTransaction, upsertMovement },
    );

    expect(result.status).toBe("submitted");
    expect(result.signature).toBe(fixture.signature);
    expect(sendRawTransaction).toHaveBeenCalledTimes(1);

    // Se transmite exactamente la tx que el cliente firmó, no una rearmada.
    const sent = sendRawTransaction.mock.calls[0]?.[0];
    expect(sent).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(sent ?? new Uint8Array()).toString("base64")).toBe(fixture.signedBase64);

    // El movimiento es la traza auditable de la salida: monto, destino y firma.
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      userId: USER,
      kind: "withdraw",
      mint: USDC_MINT,
      amountUi: 25,
      reference: fixture.input.reference,
      status: "pending",
      signature: fixture.signature,
      counterpartyAddress: DESTINATION,
    });

    expect((await store.read(USER, fixture.input.requestId))?.status).toBe("submitted");
  });

  it("el reintento del mismo requestId devuelve lo guardado sin reenviar ni duplicar el movimiento", async () => {
    const store = createInMemoryWithdrawalStore();
    const fixture = withdrawalFixture({
      requestId: "req-reintento",
      reference: `withdraw:${USDC_MINT}:25:req-reintento`,
    });
    await store.reserve(fixture.input);

    const sendRawTransaction = vi.fn(async (_rawTx: Uint8Array) => fixture.signature);
    const upsertMovement = vi.fn(async (_row: MovementRow) => true);
    const deps = { store, sendRawTransaction, upsertMovement };

    const first = await submitWithdrawal(
      { userId: USER, requestId: fixture.input.requestId, signedTransactionBase64: fixture.signedBase64 },
      deps,
    );
    // Un reintento del cliente (timeout de red, doble click) llega con la misma
    // firma; la segunda transmisión podría duplicar la salida real.
    const second = await submitWithdrawal(
      { userId: USER, requestId: fixture.input.requestId, signedTransactionBase64: fixture.signedBase64 },
      deps,
    );

    expect(second.orderId).toBe(first.orderId);
    expect(second.signature).toBe(first.signature);
    expect(second.status).toBe("submitted");
    expect(sendRawTransaction).toHaveBeenCalledTimes(1);
    expect(upsertMovement).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 5. Integridad de la transacción firmada
// ---------------------------------------------------------------------------

describe("T42: la tx firmada tiene que ser la que el servidor armó", () => {
  it("un mensaje con otro destinatario se rechaza con VALIDATION y no se transmite", async () => {
    const store = createInMemoryWithdrawalStore();
    const fixture = withdrawalFixture({ requestId: "req-destino" });
    await store.reserve(fixture.input);

    // Mismo requestId, misma firma válida, otro destinatario: el ataque obvio
    // si el servidor confiara en el requestId en vez de en el mensaje.
    const otherDestination = Keypair.generate().publicKey.toBase58();
    const altered = signedTransaction(withdrawalMessage(otherDestination, 1_000_000));

    const sendRawTransaction = vi.fn(async (_rawTx: Uint8Array) => altered.signature);
    await expect(
      submitWithdrawal(
        {
          userId: USER,
          requestId: fixture.input.requestId,
          signedTransactionBase64: altered.base64,
        },
        { store, sendRawTransaction, upsertMovement: vi.fn(async (_row: MovementRow) => true) },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    expect(httpStatusFor("VALIDATION")).toBe(400);
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });

  it("un mensaje con otro monto se rechaza con VALIDATION y no se transmite", async () => {
    const store = createInMemoryWithdrawalStore();
    const fixture = withdrawalFixture({ requestId: "req-monto" });
    await store.reserve(fixture.input);

    const altered = signedTransaction(withdrawalMessage(DESTINATION, 2_000_000));
    const sendRawTransaction = vi.fn(async (_rawTx: Uint8Array) => altered.signature);

    await expect(
      submitWithdrawal(
        {
          userId: USER,
          requestId: fixture.input.requestId,
          signedTransactionBase64: altered.base64,
        },
        { store, sendRawTransaction, upsertMovement: vi.fn(async (_row: MovementRow) => true) },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    expect(sendRawTransaction).not.toHaveBeenCalled();
  });

  it("una tx sin firmar (firma en ceros) se rechaza con VALIDATION y no se transmite", async () => {
    const store = createInMemoryWithdrawalStore();
    const fixture = withdrawalFixture({ requestId: "req-sin-firma" });
    await store.reserve(fixture.input);

    // El mensaje es idéntico al armado: lo único que falta es la firma. Con
    // ceros no hay evidencia de autorización ni forma de reclamar el envío.
    const unsigned = unsignedTransaction(fixture.message);
    const sendRawTransaction = vi.fn(async (_rawTx: Uint8Array) => fixture.signature);

    await expect(
      submitWithdrawal(
        { userId: USER, requestId: fixture.input.requestId, signedTransactionBase64: unsigned },
        { store, sendRawTransaction, upsertMovement: vi.fn(async (_row: MovementRow) => true) },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    expect(sendRawTransaction).not.toHaveBeenCalled();
    // Tampoco se reclamó: la reserva sigue disponible para firmar en serio.
    expect((await store.read(USER, fixture.input.requestId))?.status).toBe("reserved");
  });
});

// ---------------------------------------------------------------------------
// 6. Falla cerrado: sin movimiento en el libro no se transmite
// ---------------------------------------------------------------------------

describe("T42: sin traza en wallet_movements la transacción no sale", () => {
  it("si upsertMovement lanza, el envío falla UPSTREAM antes de transmitir", async () => {
    const store = createInMemoryWithdrawalStore();
    const fixture = withdrawalFixture({ requestId: "req-mov-throw" });
    await store.reserve(fixture.input);

    const sendRawTransaction = vi.fn(async (_rawTx: Uint8Array) => fixture.signature);
    const upsertMovement = vi.fn(async (_row: MovementRow): Promise<boolean> => {
      throw new Error("wallet_movements no respondió");
    });

    await expect(
      submitWithdrawal(
        {
          userId: USER,
          requestId: fixture.input.requestId,
          signedTransactionBase64: fixture.signedBase64,
        },
        { store, sendRawTransaction, upsertMovement },
      ),
    ).rejects.toMatchObject({ code: "UPSTREAM" });

    expect(sendRawTransaction).not.toHaveBeenCalled();
  });

  it("si upsertMovement devuelve false, el envío falla UPSTREAM antes de transmitir", async () => {
    const store = createInMemoryWithdrawalStore();
    const fixture = withdrawalFixture({ requestId: "req-mov-false" });
    await store.reserve(fixture.input);

    const sendRawTransaction = vi.fn(async (_rawTx: Uint8Array) => fixture.signature);
    // `false` es el "no quedó escrito" del escritor: no hay fila que audite la
    // salida, así que la tx no puede salir.
    const upsertMovement = vi.fn(async (_row: MovementRow) => false);

    await expect(
      submitWithdrawal(
        {
          userId: USER,
          requestId: fixture.input.requestId,
          signedTransactionBase64: fixture.signedBase64,
        },
        { store, sendRawTransaction, upsertMovement },
      ),
    ).rejects.toMatchObject({ code: "UPSTREAM" });

    expect(sendRawTransaction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 7. Estado: sólo una firma con evidencia se confirma
// ---------------------------------------------------------------------------

describe("T42: getWithdrawalStatus traduce la cadena al estado del retiro", () => {
  it("pasa a confirmed con una firma finalizada y actualiza el movimiento", async () => {
    const store = createInMemoryWithdrawalStore();
    const fixture = withdrawalFixture({ requestId: "req-confirmado" });
    await seedSubmitted(store, fixture);

    // `finalized` es el único nivel que no puede revertirse: es la evidencia de
    // que la plata salió y con la que se cierra el movimiento en el libro.
    const getSignatureStatuses = vi.fn(
      async (_sigs: string[]): Promise<SignatureStatusesResult> => [
        { confirmationStatus: "finalized", slot: 10, confirmations: 1, err: null },
      ],
    );
    const updateMovementStatus = vi.fn(
      async (_reference: string, _status: "confirmed" | "failed") => true,
    );

    const order = await getWithdrawalStatus(
      { userId: USER, id: fixture.input.requestId },
      { store, getSignatureStatuses, updateMovementStatus },
    );

    expect(getSignatureStatuses).toHaveBeenCalledTimes(1);
    expect(getSignatureStatuses.mock.calls[0]?.[0]).toContain(fixture.signature);
    expect(updateMovementStatus).toHaveBeenCalledWith(fixture.input.reference, "confirmed");
    expect(order.status).toBe("confirmed");
    // El libro queda cerrado: una lectura posterior no vuelve a conciliar.
    expect((await store.read(USER, fixture.input.requestId))?.status).toBe("confirmed");
  });

  it("pasa a failed cuando el estado on-chain trae err y actualiza el movimiento", async () => {
    const store = createInMemoryWithdrawalStore();
    const fixture = withdrawalFixture({ requestId: "req-fallido" });
    await seedSubmitted(store, fixture);

    // Un `err` on-chain es definitivo aunque el RPC reporte confirmación alta:
    // la tx se ejecutó y falló, así que el cupo no vuelve y el movimiento
    // tampoco puede quedar como pagado.
    const getSignatureStatuses = vi.fn(
      async (_sigs: string[]): Promise<SignatureStatusesResult> => [
        {
          confirmationStatus: "confirmed",
          slot: 11,
          confirmations: 1,
          err: { InstructionError: [0, { Custom: 1 }] },
        },
      ],
    );
    const updateMovementStatus = vi.fn(
      async (_reference: string, _status: "confirmed" | "failed") => true,
    );

    const order = await getWithdrawalStatus(
      { userId: USER, id: fixture.input.requestId },
      { store, getSignatureStatuses, updateMovementStatus },
    );

    expect(updateMovementStatus).toHaveBeenCalledWith(fixture.input.reference, "failed");
    expect(order.status).toBe("failed");
  });

  it("devuelve un Order de venta con los montos del libro y la firma guardada", async () => {
    const store = createInMemoryWithdrawalStore();
    const fixture = withdrawalFixture({
      requestId: "req-forma",
      reference: `withdraw:${STOCK_MINT}:12.5:req-forma`,
      mint: STOCK_MINT,
      symbol: "AAPLx",
      // Fracción de acción: el monto en unidades no coincide con el notional en
      // dólares, así la prueba distingue un campo del otro.
      amountUi: 12.5,
      amountUsd: 12.4,
    });
    await seedSubmitted(store, fixture);

    // Sólo `processed`: todavía puede revertirse, así que el retiro sigue
    // enviado y no se toca el movimiento.
    const getSignatureStatuses = vi.fn(
      async (_sigs: string[]): Promise<SignatureStatusesResult> => [
        { confirmationStatus: "processed", slot: 12, confirmations: 0, err: null },
      ],
    );
    const updateMovementStatus = vi.fn(
      async (_reference: string, _status: "confirmed" | "failed") => true,
    );

    const order = await getWithdrawalStatus(
      { userId: USER, id: fixture.input.requestId },
      { store, getSignatureStatuses, updateMovementStatus },
    );

    expect(order).toMatchObject({
      userId: USER,
      side: "sell",
      symbol: "AAPLx",
      inAmountUi: 12.5,
      outAmountUi: 12.4,
      feeBps: 0,
      status: "submitted",
      signature: fixture.signature,
    });
    expect(updateMovementStatus).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 8. Dueño del retiro, retiro inexistente y reserva vencida
// ---------------------------------------------------------------------------

describe("T42: el retiro pertenece a un solo usuario", () => {
  it("otro userId no puede enviar el retiro ajeno", async () => {
    const store = createInMemoryWithdrawalStore();
    const fixture = withdrawalFixture({ requestId: "req-ajeno-submit" });
    await store.reserve(fixture.input);

    const sendRawTransaction = vi.fn(async (_rawTx: Uint8Array) => fixture.signature);

    await expect(
      submitWithdrawal(
        {
          userId: OTHER_USER,
          requestId: fixture.input.requestId,
          signedTransactionBase64: fixture.signedBase64,
        },
        { store, sendRawTransaction, upsertMovement: vi.fn(async (_row: MovementRow) => true) },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(sendRawTransaction).not.toHaveBeenCalled();
    // El retiro del dueño no se movió: nadie ajeno consumió su reserva.
    expect((await store.read(USER, fixture.input.requestId))?.status).toBe("reserved");
  });

  it("otro userId no puede consultar el estado del retiro ajeno", async () => {
    const store = createInMemoryWithdrawalStore();
    const fixture = withdrawalFixture({ requestId: "req-ajeno-status" });
    await seedSubmitted(store, fixture);

    // NOT_FOUND y no FORBIDDEN: responder "existe pero no es tuyo" ya confirma
    // que hay un retiro con ese id y con qué monto.
    await expect(
      getWithdrawalStatus({ userId: OTHER_USER, id: fixture.input.requestId }, { store }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("un retiro inexistente responde NOT_FOUND", async () => {
    const store = createInMemoryWithdrawalStore();

    // Un id inventado no puede caer en un estado por defecto ("pending",
    // "submitted") que la UI muestre como una salida real en curso.
    await expect(
      getWithdrawalStatus({ userId: USER, id: "wdr_que_no_existe" }, { store }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("un retiro vencido responde QUOTE_EXPIRED sin transmitir", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T15:00:00.000Z"));
    const store = createInMemoryWithdrawalStore();
    const fixture = withdrawalFixture({
      requestId: "req-vencido",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await store.reserve(fixture.input);

    // La reserva venció: el blockhash de la tx armada ya no sirve, así que
    // aceptarla dejaría cupo tomado por algo que nunca aterriza.
    vi.setSystemTime(new Date("2026-03-10T15:02:00.000Z"));
    const sendRawTransaction = vi.fn(async (_rawTx: Uint8Array) => fixture.signature);

    await expect(
      submitWithdrawal(
        {
          userId: USER,
          requestId: fixture.input.requestId,
          signedTransactionBase64: fixture.signedBase64,
        },
        { store, sendRawTransaction, upsertMovement: vi.fn(async (_row: MovementRow) => true) },
      ),
    ).rejects.toMatchObject({ code: "QUOTE_EXPIRED" });

    expect(sendRawTransaction).not.toHaveBeenCalled();
  });
});
