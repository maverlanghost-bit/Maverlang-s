import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/cron/reconcile-wallet/route";
import { __resetFlagsForTests, __setFlagReaderForTests } from "@/lib/flags";
import {
  countDepositScanWallets,
  findCryptoDepositOwner,
  insertCryptoDeposit,
  listWalletsForDepositScan,
} from "@/lib/services/deposits.supabase";
import { USDC_DECIMALS, USDC_MINT_SOLANA } from "@/lib/wallet/deposit-indexer";
import { syncSolanaUsdcDeposits, type ParsedTxLike } from "@/lib/wallet/deposit-sync";

/**
 * Pre-lanzamiento — ATRIBUCIÓN del depósito USDC (quién recibe el dinero).
 *
 * El barrido de depósitos acredita dinero real: si el `user_id` del crédito
 * saliera del request, de la cadena o del remitente en vez de la fila
 * `public.wallets` de la dirección destino, cualquiera podría dirigir un
 * depósito ajeno a su propia cuenta (o duplicar un crédito repitiendo la
 * misma firma). Estas pruebas ejercitan el camino REAL de producción:
 *
 * - `syncSolanaUsdcDeposits` sin dependencias inyectadas (usa sus `liveDeps`),
 * - `listWalletsForDepositScan`, `countDepositScanWallets`,
 *   `insertCryptoDeposit`, `findCryptoDepositOwner` reales,
 * - `upsertWalletMovement` real (idempotencia por `reference`),
 * - la ruta `POST/GET /api/cron/reconcile-wallet` real.
 *
 * Sólo se mockean las fronteras externas: el RPC de Solana, el cliente de
 * Supabase (una base en memoria con las MISMAS reglas de unicidad que las
 * migraciones: `crypto_deposits.signature` única global y
 * `wallet_movements.reference` única) y la conciliación de pendientes, que no
 * es el objeto de esta prueba. Sin red, sin Supabase real y sin `.env`.
 */

type DbRow = Record<string, unknown>;

const sandbox = vi.hoisted(() => {
  const db: Record<string, DbRow[]> = {
    wallets: [],
    crypto_deposits: [],
    wallet_movements: [],
    wallet_reconciliations: [],
  };

  // Contadores de ESCRITURA: es la única forma de probar que un segundo
  // barrido no "reintenta" siquiera insertar el mismo depósito.
  const writes = {
    cryptoAttempts: 0,
    cryptoInserted: 0,
    movementAttempts: 0,
    movementInserted: 0,
  };

  // Cadena simulada: firmas por dirección, transacción parseada por firma y
  // estado por firma. Así cada billetera ve lo que el RPC le entregaría.
  const chain = {
    signatures: {} as Record<string, string[]>,
    txs: {} as Record<string, unknown>,
    statuses: {} as Record<string, unknown>,
  };

  interface QueryResult {
    data: DbRow[] | DbRow | null;
    error: { message: string } | null;
    count?: number;
  }

  function likeToRegExp(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/%/g, ".*")
      .replace(/_/g, ".");
    return new RegExp(`^${escaped}$`);
  }

  /**
   * Constructor de consultas mínimo con la semántica que usan
   * `deposits.supabase.ts` y `wallet-movements.supabase.ts`. `upsert` con
   * `ignoreDuplicates` devuelve `data: []` cuando la clave ya existe, igual
   * que PostgREST: el servicio distingue "inserté" de "ya estaba".
   */
  class Query implements PromiseLike<QueryResult> {
    private tableRows: DbRow[];
    private filters: Array<(row: DbRow) => boolean> = [];
    private sort: { column: string; ascending: boolean } | null = null;
    private bounds: [number, number] | null = null;
    private max: number | null = null;
    private wantCount = false;
    private head = false;
    private single = false;
    private action:
      | { kind: "select" }
      | { kind: "upsert"; payload: DbRow; onConflict: string }
      | { kind: "insert"; payload: DbRow }
      | { kind: "update"; patch: DbRow } = { kind: "select" };

    constructor(private table: string) {
      db[table] = db[table] ?? [];
      this.tableRows = db[table];
    }

    select(_columns?: string, options?: { count?: string; head?: boolean }): this {
      if (options?.count) this.wantCount = true;
      if (options?.head) this.head = true;
      return this;
    }

    eq(column: string, value: unknown): this {
      this.filters.push((row) => row[column] === value);
      return this;
    }

    neq(column: string, value: unknown): this {
      this.filters.push((row) => row[column] !== value);
      return this;
    }

    like(column: string, pattern: string): this {
      const rx = likeToRegExp(pattern);
      this.filters.push((row) => typeof row[column] === "string" && rx.test(row[column] as string));
      return this;
    }

    order(column: string, options?: { ascending?: boolean }): this {
      this.sort = { column, ascending: options?.ascending !== false };
      return this;
    }

    range(from: number, to: number): this {
      this.bounds = [from, to];
      return this;
    }

    limit(value: number): this {
      this.max = value;
      return this;
    }

    maybeSingle(): this {
      this.single = true;
      return this;
    }

    upsert(payload: DbRow, options?: { onConflict?: string; ignoreDuplicates?: boolean }): this {
      this.action = { kind: "upsert", payload, onConflict: options?.onConflict ?? "id" };
      return this;
    }

    insert(payload: DbRow): this {
      this.action = { kind: "insert", payload };
      return this;
    }

    update(patch: DbRow): this {
      this.action = { kind: "update", patch };
      return this;
    }

    then<TResult1, TResult2>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
    }

    private matches(): DbRow[] {
      let rows = this.tableRows.filter((row) => this.filters.every((fn) => fn(row)));
      if (this.sort) {
        const { column, ascending } = this.sort;
        rows = [...rows].sort((left, right) => {
          const a = String(left[column] ?? "");
          const b = String(right[column] ?? "");
          return ascending ? a.localeCompare(b) : b.localeCompare(a);
        });
      }
      if (this.bounds) {
        const [from, to] = this.bounds;
        rows = rows.slice(from, to + 1);
      }
      if (this.max !== null) rows = rows.slice(0, this.max);
      return rows;
    }

    private execute(): QueryResult {
      const action = this.action;

      if (action.kind === "upsert") {
        const isCrypto = this.table === "crypto_deposits";
        if (isCrypto) writes.cryptoAttempts += 1;
        else writes.movementAttempts += 1;
        const payload = action.payload;
        const key = action.onConflict;
        // Misma regla que el índice único de la migración: la firma/reference
        // manda. Un conflicto NO reasigna el dueño ni cambia el monto.
        const exists = this.tableRows.some((row) => row[key] === payload[key]);
        if (exists) return { data: [], error: null };
        const row: DbRow = {
          created_at: new Date().toISOString(),
          ...payload,
        };
        if (isCrypto) row.id = `dep-${this.tableRows.length + 1}`;
        this.tableRows.push(row);
        if (isCrypto) writes.cryptoInserted += 1;
        else writes.movementInserted += 1;
        return { data: [row], error: null };
      }

      if (action.kind === "insert") {
        const row: DbRow = { created_at: new Date().toISOString(), ...action.payload };
        this.tableRows.push(row);
        return { data: [row], error: null };
      }

      if (action.kind === "update") {
        const matched = this.matches();
        for (const row of matched) Object.assign(row, action.patch);
        return { data: matched, error: null };
      }

      const rows = this.matches();
      if (this.wantCount && this.head) return { data: null, error: null, count: rows.length };
      if (this.single) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }
  }

  return { db, writes, chain, query: (table: string) => new Query(table) };
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: (table: string) => sandbox.query(table) }),
}));

vi.mock("@/lib/solana/connection", () => ({
  getServerConnection: () => ({
    getSignaturesForAddress: async (publicKey: { toBase58(): string }) =>
      (sandbox.chain.signatures[publicKey.toBase58()] ?? []).map((signature) => ({ signature })),
    getParsedTransactions: async (signatures: string[]) =>
      signatures.map((signature) => sandbox.chain.txs[signature] ?? null),
    getSignatureStatuses: async (signatures: string[]) => ({
      value: signatures.map((signature) => sandbox.chain.statuses[signature] ?? null),
    }),
  }),
}));

// La conciliación de pendientes no es el objeto de esta prueba: se aísla para
// que el cron devuelva su resumen sin tocar otras tablas.
vi.mock("@/lib/wallet/reconcile-movements", () => ({
  reconcileWalletMovements: async () => ({
    reviewed: 0,
    confirmed: 0,
    failed: 0,
    disappeared: 0,
    pending: 0,
    skipped: 0,
    durationMs: 0,
    truncated: false,
  }),
}));

/** Direcciones Solana válidas (32 bytes en base58) para tres usuarios distintos. */
const WALLET_A = "11111111111111111111111111111111";
const WALLET_B = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const WALLET_SIN_DID = "So11111111111111111111111111111111111111112";

const CRON_URL = "http://localhost:3100/api/cron/reconcile-wallet";
const CRON_AUTH = { authorization: "Bearer cron-test-secret" };

function seedWallets(
  rows: Array<{ userId: string; address: string; privyUserId?: string | null }>,
): void {
  sandbox.db.wallets = rows.map((row) => ({
    user_id: row.userId,
    address: row.address,
    chain: "solana",
    // `undefined` = fila verificada normal; `null` = fila vieja sin DID (0040).
    privy_user_id: row.privyUserId === undefined ? "did:privy:test" : row.privyUserId,
  }));
}

function balance(accountIndex: number, owner: string, uiAmount: number) {
  return {
    accountIndex,
    mint: USDC_MINT_SOLANA,
    owner,
    uiTokenAmount: {
      uiAmount,
      amount: String(Math.round(uiAmount * 10 ** USDC_DECIMALS)),
      decimals: USDC_DECIMALS,
    },
  };
}

/** Transferencia USDC: el remitente baja y el destino sube en la misma tx. */
function transferTx(params: {
  signature: string;
  from: { owner: string; before: number; after: number };
  to: { owner: string; before: number; after: number };
}): ParsedTxLike {
  return {
    meta: {
      err: null,
      preTokenBalances: [
        balance(0, params.from.owner, params.from.before),
        balance(1, params.to.owner, params.to.before),
      ],
      postTokenBalances: [
        balance(0, params.from.owner, params.from.after),
        balance(1, params.to.owner, params.to.after),
      ],
    },
    transaction: { signatures: [params.signature] },
    blockTime: 1_700_000_000,
  };
}

/** Tx con saldo propio para cada dueño (payload de RPC duplicado o adulterado). */
function fundedTx(
  signature: string,
  owners: Array<{ owner: string; before: number; after: number }>,
): ParsedTxLike {
  return {
    meta: {
      err: null,
      preTokenBalances: owners.map((entry, index) => balance(index, entry.owner, entry.before)),
      postTokenBalances: owners.map((entry, index) => balance(index, entry.owner, entry.after)),
    },
    transaction: { signatures: [signature] },
    blockTime: 1_700_000_000,
  };
}

/** Publica una transacción y la asocia a la lista de firmas de una dirección. */
function publish(params: {
  signature: string;
  address: string;
  tx: ParsedTxLike;
  status?: "confirmed" | "finalized" | "processed";
}): void {
  sandbox.chain.txs[params.signature] = params.tx;
  sandbox.chain.statuses[params.signature] = {
    confirmationStatus: params.status ?? "confirmed",
    slot: 9,
    confirmations: 1,
    err: null,
  };
  sandbox.chain.signatures[params.address] = [
    ...(sandbox.chain.signatures[params.address] ?? []),
    params.signature,
  ];
}

function resetSandbox(): void {
  for (const table of Object.keys(sandbox.db)) sandbox.db[table] = [];
  sandbox.writes.cryptoAttempts = 0;
  sandbox.writes.cryptoInserted = 0;
  sandbox.writes.movementAttempts = 0;
  sandbox.writes.movementInserted = 0;
  sandbox.chain.signatures = {};
  sandbox.chain.txs = {};
  sandbox.chain.statuses = {};
}

beforeEach(() => {
  resetSandbox();
  // Dos llaves del barrido (staging + flag de producto) para que corra de verdad.
  vi.stubEnv("DATA_MODE", "live");
  vi.stubEnv("WALLET_DEPOSIT_SYNC", "on");
  vi.stubEnv("CRON_SECRET", "cron-test-secret");
  __setFlagReaderForTests(async (key) => key === "deposits_enabled");
  seedWallets([
    { userId: "user-a", address: WALLET_A },
    { userId: "user-b", address: WALLET_B },
    // Fila antigua sin identidad Privy: no se puede atribuir, queda fuera.
    { userId: "user-sin-did", address: WALLET_SIN_DID, privyUserId: null },
  ]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetFlagsForTests();
});

describe("atribución 1: el crédito sale de la fila `wallets` de la dirección destino", () => {
  /**
   * RIESGO: si el barrido tomara el usuario de la cadena, del remitente o de
   * la primera fila que encuentra, un depósito entraría a la cuenta equivocada
   * (dinero de una persona disponible para otra). La identidad tiene que ser
   * SIEMPRE la de `public.wallets` de la dirección que recibió los USDC.
   */

  it("lista sólo billeteras con did:privy y mapea user_id → userId", async () => {
    const wallets = await listWalletsForDepositScan(50, 0);

    expect(wallets).toEqual([
      { userId: "user-a", address: WALLET_A },
      { userId: "user-b", address: WALLET_B },
    ]);
    // La misma cota que usa el cron para rotar el lote.
    expect(await countDepositScanWallets()).toBe(2);
  });

  it("acredita al dueño de la dirección destino, nunca al remitente ni a la otra billetera", async () => {
    // user-a envía 25 USDC a la billetera de user-b. Ambas billeteras ven la
    // misma firma (el RPC la devuelve para las dos, como en una tx con dos
    // cuentas propias), así que la prueba no depende de que sólo una la vea.
    const tx = transferTx({
      signature: "sig-a-b",
      from: { owner: WALLET_A, before: 100, after: 75 },
      to: { owner: WALLET_B, before: 0, after: 25 },
    });
    publish({ signature: "sig-a-b", address: WALLET_A, tx });
    publish({ signature: "sig-a-b", address: WALLET_B, tx });

    const summary = await syncSolanaUsdcDeposits();

    expect(summary.ok).toBe(true);
    expect(summary.walletsScanned).toBe(2);
    expect(summary.confirmed).toBe(1);
    expect(sandbox.db.crypto_deposits).toHaveLength(1);
    expect(sandbox.db.crypto_deposits[0]).toMatchObject({
      user_id: "user-b",
      signature: "sig-a-b",
      amount_ui: 25,
      mint: USDC_MINT_SOLANA,
    });
    expect(sandbox.db.crypto_deposits.some((row) => row.user_id === "user-a")).toBe(false);
    // La actividad también es del dueño de la dirección, no del remitente.
    expect(sandbox.db.wallet_movements).toHaveLength(1);
    expect(sandbox.db.wallet_movements[0]).toMatchObject({
      user_id: "user-b",
      reference: "sig-a-b",
      amount_ui: 25,
      status: "confirmed",
    });
  });

  it("una billetera sin identidad Privy no se barre aunque tenga el depósito", async () => {
    const tx = transferTx({
      signature: "sig-sin-did",
      from: { owner: WALLET_B, before: 50, after: 30 },
      to: { owner: WALLET_SIN_DID, before: 0, after: 20 },
    });
    publish({ signature: "sig-sin-did", address: WALLET_SIN_DID, tx });

    const summary = await syncSolanaUsdcDeposits();

    expect(summary.walletsScanned).toBe(2);
    expect(sandbox.db.crypto_deposits).toEqual([]);
    expect(sandbox.db.wallet_movements).toEqual([]);
  });
});

describe("atribución 2: ninguna entrada pública elige el usuario acreditado", () => {
  /**
   * RIESGO: el cron es invocable con un token; si el handler aceptara
   * `userId`, `amountUi`, `fromAddress` o la dirección destino del cuerpo o de
   * la query, quien tenga el token (o un proxy que lo reenvíe) podría
   * acreditarse un depósito ajeno o inflar el monto. La ruta no debe leer
   * ninguno de esos datos: sólo dispara el barrido, que saca todo de la base
   * y de la cadena.
   */

  it("el cuerpo del POST con userId/monto ajenos no cambia el crédito", async () => {
    const tx = transferTx({
      signature: "sig-a-b",
      from: { owner: WALLET_A, before: 100, after: 75 },
      to: { owner: WALLET_B, before: 0, after: 25 },
    });
    publish({ signature: "sig-a-b", address: WALLET_B, tx });

    const res = await POST(
      new Request(
        `${CRON_URL}?userId=user-atacante&user_id=user-atacante&amountUi=9999&destination=${WALLET_A}`,
        {
          method: "POST",
          headers: { ...CRON_AUTH, "content-type": "application/json" },
          body: JSON.stringify({
            userId: "user-atacante",
            user_id: "user-atacante",
            amountUi: 9999,
            fromAddress: WALLET_A,
            destination: WALLET_A,
            signature: "sig-a-b",
          }),
        },
      ),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data?: { deposits?: { confirmed: number } };
    };
    expect(body.ok).toBe(true);
    expect(body.data?.deposits?.confirmed).toBe(1);
    expect(sandbox.db.crypto_deposits).toHaveLength(1);
    expect(sandbox.db.crypto_deposits[0]).toMatchObject({
      user_id: "user-b",
      amount_ui: 25,
      signature: "sig-a-b",
    });
    expect(sandbox.db.crypto_deposits.some((row) => row.user_id === "user-atacante")).toBe(false);
    expect(sandbox.db.wallet_movements.every((row) => row.user_id === "user-b")).toBe(true);
  });

  it("la query del GET (userId/fromAddress) tampoco redirige el crédito", async () => {
    const tx = transferTx({
      signature: "sig-a-b",
      from: { owner: WALLET_A, before: 100, after: 60 },
      to: { owner: WALLET_B, before: 0, after: 40 },
    });
    publish({ signature: "sig-a-b", address: WALLET_B, tx });

    const res = await GET(
      new Request(
        `${CRON_URL}?userId=user-a&amountUi=999&fromAddress=${WALLET_A}&signature=sig-a-b`,
        { headers: CRON_AUTH },
      ),
    );

    expect(res.status).toBe(200);
    expect(
      sandbox.db.crypto_deposits.map((row) => [row.user_id, row.amount_ui]),
    ).toEqual([["user-b", 40]]);
    expect(sandbox.db.wallet_movements.map((row) => row.user_id)).toEqual(["user-b"]);
  });

  it("sin token la ruta no escribe nada (no hay entrada pública anónima)", async () => {
    const tx = transferTx({
      signature: "sig-a-b",
      from: { owner: WALLET_A, before: 100, after: 75 },
      to: { owner: WALLET_B, before: 0, after: 25 },
    });
    publish({ signature: "sig-a-b", address: WALLET_B, tx });

    const res = await POST(new Request(CRON_URL, { method: "POST" }));

    expect(res.status).toBe(401);
    expect(sandbox.db.crypto_deposits).toEqual([]);
    expect(sandbox.writes.cryptoAttempts).toBe(0);
  });
});

describe("atribución 3: una firma registrada no se reasigna a otro usuario", () => {
  /**
   * RIESGO: si el barrido "reparara" el dueño de una firma existente (o si el
   * upsert actualizara `user_id` en conflicto), el mismo depósito podría
   * moverse de una cuenta a otra: la víctima pierde el crédito y el atacante
   * lo recibe. El dueño original manda; el segundo intento se rechaza.
   */

  it("findCryptoDepositOwner devuelve el dueño original y el insert de otro usuario no lo cambia", async () => {
    sandbox.db.crypto_deposits = [
      {
        id: "dep-1",
        user_id: "user-a",
        mint: USDC_MINT_SOLANA,
        amount_ui: 25,
        signature: "sig-taken",
        from_address: null,
        created_at: "2026-11-05T10:00:00.000Z",
      },
    ];

    expect(await findCryptoDepositOwner("sig-taken")).toEqual({ ok: true, userId: "user-a" });

    // Segundo usuario (otra billetera) con la misma firma: la base ignora el
    // conflicto y devuelve `false`; el dueño no se reasigna nunca.
    expect(
      await insertCryptoDeposit({
        userId: "user-b",
        mint: USDC_MINT_SOLANA,
        amountUi: 500,
        signature: "sig-taken",
        fromAddress: WALLET_A,
      }),
    ).toBe(false);

    expect(await findCryptoDepositOwner("sig-taken")).toEqual({ ok: true, userId: "user-a" });
    expect(sandbox.db.crypto_deposits).toHaveLength(1);
    expect(sandbox.db.crypto_deposits[0]).toMatchObject({ user_id: "user-a", amount_ui: 25 });

    // Contrato real: una firma desconocida no es error, es dueño nulo.
    expect(await findCryptoDepositOwner("sig-desconocida")).toEqual({ ok: true, userId: null });
  });

  it("el barrido descarta la firma ajena, no escribe movimiento y lo reporta", async () => {
    sandbox.db.crypto_deposits = [
      {
        id: "dep-1",
        user_id: "user-a",
        mint: USDC_MINT_SOLANA,
        amount_ui: 25,
        signature: "sig-taken",
        from_address: null,
        created_at: "2026-11-05T10:00:00.000Z",
      },
    ];
    // Payload hostil: la MISMA firma aparece con +25 para las dos billeteras.
    const tx = fundedTx("sig-taken", [
      { owner: WALLET_A, before: 0, after: 25 },
      { owner: WALLET_B, before: 0, after: 25 },
    ]);
    publish({ signature: "sig-taken", address: WALLET_A, tx });
    publish({ signature: "sig-taken", address: WALLET_B, tx });

    const summary = await syncSolanaUsdcDeposits();

    expect(sandbox.db.crypto_deposits).toHaveLength(1);
    expect(sandbox.db.crypto_deposits[0]).toMatchObject({ user_id: "user-a", amount_ui: 25 });
    // Ni movimiento para user-b ni crédito contabilizado.
    expect(sandbox.db.wallet_movements).toEqual([]);
    expect(summary.confirmed).toBe(0);
    expect(summary.duplicates).toBe(1);
    expect(summary.errors.join(" | ")).toContain("otro usuario");
    // El intento de insert existió (conflicto), pero no insertó nada.
    expect(sandbox.writes.cryptoAttempts).toBe(1);
    expect(sandbox.writes.cryptoInserted).toBe(0);
  });
});

describe("atribución 4: la segunda entrega de la misma firma no duplica el crédito", () => {
  /**
   * RIESGO: el cron corre cada minuto y puede reintentarse; si la misma firma
   * se acreditara dos veces (o si el monto se actualizara con lo que diga la
   * segunda lectura), el saldo del usuario se inflaría con dinero que no
   * existe. Se cuentan escrituras, filas y montos.
   */

  it("un segundo barrido no crea crédito ni movimiento nuevo", async () => {
    const tx = transferTx({
      signature: "sig-unica",
      from: { owner: WALLET_A, before: 100, after: 60 },
      to: { owner: WALLET_B, before: 0, after: 40 },
    });
    publish({ signature: "sig-unica", address: WALLET_B, tx });

    const first = await syncSolanaUsdcDeposits();
    expect(first.confirmed).toBe(1);
    expect(sandbox.writes).toEqual({
      cryptoAttempts: 1,
      cryptoInserted: 1,
      movementAttempts: 1,
      movementInserted: 1,
    });

    const second = await syncSolanaUsdcDeposits();

    expect(second.confirmed).toBe(0);
    expect(second.duplicates).toBe(1);
    expect(sandbox.db.crypto_deposits).toHaveLength(1);
    expect(sandbox.db.crypto_deposits[0]).toMatchObject({ user_id: "user-b", amount_ui: 40 });
    expect(sandbox.db.wallet_movements).toHaveLength(1);
    expect(sandbox.db.wallet_movements[0]).toMatchObject({
      reference: "sig-unica",
      amount_ui: 40,
      status: "confirmed",
    });
    // Ni siquiera se intentó escribir: la firma ya estaba registrada.
    expect(sandbox.writes).toEqual({
      cryptoAttempts: 1,
      cryptoInserted: 1,
      movementAttempts: 1,
      movementInserted: 1,
    });

    // La base también aguanta una carrera que se salte ese chequeo.
    expect(
      await insertCryptoDeposit({
        userId: "user-b",
        mint: USDC_MINT_SOLANA,
        amountUi: 40,
        signature: "sig-unica",
        fromAddress: null,
      }),
    ).toBe(false);
    expect(sandbox.db.crypto_deposits).toHaveLength(1);
  });

  it("una segunda lectura con otro monto no cambia el crédito original", async () => {
    const original = transferTx({
      signature: "sig-fija",
      from: { owner: WALLET_A, before: 100, after: 60 },
      to: { owner: WALLET_B, before: 0, after: 40 },
    });
    publish({ signature: "sig-fija", address: WALLET_B, tx: original });
    await syncSolanaUsdcDeposits();

    // La cadena ahora informa otra cosa para la MISMA firma.
    sandbox.chain.txs["sig-fija"] = transferTx({
      signature: "sig-fija",
      from: { owner: WALLET_A, before: 100, after: 60 },
      to: { owner: WALLET_B, before: 0, after: 540 },
    });
    await syncSolanaUsdcDeposits();

    expect(sandbox.db.crypto_deposits).toHaveLength(1);
    expect(sandbox.db.crypto_deposits[0]).toMatchObject({ amount_ui: 40 });
    expect(sandbox.db.wallet_movements).toHaveLength(1);
    expect(sandbox.db.wallet_movements[0]).toMatchObject({ amount_ui: 40 });
  });

  it("reintentar el cron con la misma cadena deja el mismo saldo acreditado", async () => {
    const tx = transferTx({
      signature: "sig-reintento",
      from: { owner: WALLET_A, before: 100, after: 75 },
      to: { owner: WALLET_B, before: 0, after: 25 },
    });
    publish({ signature: "sig-reintento", address: WALLET_B, tx });

    const first = await POST(new Request(CRON_URL, { method: "POST", headers: CRON_AUTH }));
    const second = await POST(new Request(CRON_URL, { method: "POST", headers: CRON_AUTH }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as {
      data?: { deposits?: { confirmed: number; duplicates: number } };
    };
    expect(secondBody.data?.deposits?.confirmed).toBe(0);
    expect(secondBody.data?.deposits?.duplicates).toBe(1);

    expect(sandbox.db.crypto_deposits).toHaveLength(1);
    expect(sandbox.db.crypto_deposits[0]).toMatchObject({ user_id: "user-b", amount_ui: 25 });
    expect(sandbox.db.wallet_movements).toHaveLength(1);
    expect(sandbox.db.wallet_movements[0]).toMatchObject({ amount_ui: 25, status: "confirmed" });
    expect(
      sandbox.db.crypto_deposits.reduce((total, row) => total + Number(row.amount_ui ?? 0), 0),
    ).toBe(25);
  });
});
