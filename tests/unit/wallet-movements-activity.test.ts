import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Feed de movimientos por usuario (`wallet_movements`, migración 0030).
 *
 * Sólo service_role toca la tabla, así que la lectura vive en
 * `lib/services/wallet-movements.supabase.ts`. Esta prueba fija tres cosas que
 * el feed de `/app/billetera` da por sentadas: el mapeo snake_case → camelCase
 * (con `null` reales, no strings vacíos), el tope de filas por consulta
 * (1..200, 50 por defecto) y que un error de Supabase devuelva lista vacía en
 * vez de reventar la pantalla.
 *
 * Sin red, sin Supabase real y sin `.env`: se mockea el cliente admin.
 */

const state = vi.hoisted(() => ({
  rows: null as unknown,
  error: null as unknown,
  tables: [] as string[],
  selects: [] as string[],
  filters: [] as string[],
  orders: [] as string[],
  limits: [] as number[],
}));

vi.mock("@/lib/supabase/admin", () => {
  type Chain = {
    select: (columns: string) => Chain;
    eq: (column: string, value: unknown) => Chain;
    order: (column: string, options?: { ascending?: boolean }) => Chain;
    limit: (count: number) => Promise<{ data: unknown; error: unknown }>;
  };
  const chain: Chain = {
    select: (columns) => {
      state.selects.push(columns);
      return chain;
    },
    eq: (column, value) => {
      state.filters.push(`${column}=${String(value)}`);
      return chain;
    },
    order: (column, options) => {
      state.orders.push(`${column}:${options?.ascending === false ? "desc" : "asc"}`);
      return chain;
    },
    limit: (count) => {
      state.limits.push(count);
      return Promise.resolve({ data: state.rows, error: state.error });
    },
  };
  return {
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        state.tables.push(table);
        return chain;
      },
    }),
  };
});

import {
  listUserWalletMovements,
  walletMovementsStore,
} from "@/lib/services/wallet-movements.supabase";

/** Fila cruda tal como la devuelve PostgREST (snake_case). */
function rawRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "mov-1",
    user_id: "user-1",
    kind: "deposit",
    mint: "So11111111111111111111111111111111111111112",
    amount_ui: 0.5,
    reference: "dep:user-1:abc",
    status: "confirmed",
    signature: "firma-1",
    counterparty_address: "wallet-1",
    created_at: "2026-11-01T10:00:00.000Z",
    confirmed_at: "2026-11-01T10:00:05.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  state.rows = null;
  state.error = null;
  state.tables.length = 0;
  state.selects.length = 0;
  state.filters.length = 0;
  state.orders.length = 0;
  state.limits.length = 0;
});

describe("listUserWalletMovements: lectura del feed por usuario", () => {
  it("mapea snake_case → camelCase y conserva los nulls", async () => {
    state.rows = [
      rawRow(),
      rawRow({
        id: "mov-2",
        kind: "withdraw",
        amount_ui: 12.5,
        reference: "wd:user-1:def",
        signature: null,
        counterparty_address: null,
        created_at: "2026-10-30T08:30:00.000Z",
        confirmed_at: null,
      }),
    ];

    const rows = await listUserWalletMovements({ userId: "user-1" });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      id: "mov-1",
      userId: "user-1",
      kind: "deposit",
      mint: "So11111111111111111111111111111111111111112",
      amountUi: 0.5,
      reference: "dep:user-1:abc",
      status: "confirmed",
      signature: "firma-1",
      counterpartyAddress: "wallet-1",
      createdAt: "2026-11-01T10:00:00.000Z",
      confirmedAt: "2026-11-01T10:00:05.000Z",
    });
    expect(rows[1]).toMatchObject({
      id: "mov-2",
      kind: "withdraw",
      amountUi: 12.5,
      signature: null,
      counterpartyAddress: null,
      confirmedAt: null,
    });
    // `numeric` de PostgREST puede llegar como texto: el feed siempre entrega número.
    expect(typeof rows[1]?.amountUi).toBe("number");
    // Nada de campos inventados fuera del tipo (comparación sin depender del orden).
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(
      [
        "id",
        "userId",
        "kind",
        "mint",
        "amountUi",
        "reference",
        "status",
        "signature",
        "counterpartyAddress",
        "createdAt",
        "confirmedAt",
      ].sort(),
    );
  });

  it("filtra por usuario, ordena por fecha descendente y pide las columnas del tipo", async () => {
    state.rows = [];

    await listUserWalletMovements({ userId: "user-1" });

    expect(state.tables).toEqual(["wallet_movements"]);
    expect(state.filters).toContain("user_id=user-1");
    expect(state.orders).toEqual(["created_at:desc"]);
    expect(state.selects[0]).toContain("counterparty_address");
    expect(state.selects[0]).toContain("amount_ui");
  });

  it("sin límite explícito pide 50 filas", async () => {
    state.rows = [];

    await listUserWalletMovements({ userId: "user-1" });

    expect(state.limits).toEqual([50]);
  });

  it("acota el límite al rango 1..200 (0 → 1, 500 → 200)", async () => {
    state.rows = [];

    await listUserWalletMovements({ userId: "user-1", limit: 0 });
    await listUserWalletMovements({ userId: "user-1", limit: 500 });
    await listUserWalletMovements({ userId: "user-1", limit: 120 });

    expect(state.limits).toEqual([1, 200, 120]);
  });

  it("un error de Supabase devuelve lista vacía", async () => {
    state.rows = null;
    state.error = { message: "permission denied" };

    await expect(listUserWalletMovements({ userId: "user-1" })).resolves.toEqual([]);
  });

  it("`data` nula sin error también devuelve lista vacía", async () => {
    state.rows = null;
    state.error = null;

    await expect(listUserWalletMovements({ userId: "user-1" })).resolves.toEqual([]);
  });

  it("una lista vacía se devuelve tal cual", async () => {
    state.rows = [];
    state.error = null;

    await expect(listUserWalletMovements({ userId: "user-1" })).resolves.toEqual([]);
  });
});

describe("walletMovementsStore: el feed queda expuesto en el store", () => {
  it("expone exactamente la misma función", () => {
    expect(walletMovementsStore.listUserWalletMovements).toBe(listUserWalletMovements);
  });

  it("a través del store devuelve el mismo mapeo", async () => {
    state.rows = [rawRow()];

    const rows = await walletMovementsStore.listUserWalletMovements({ userId: "user-1", limit: 10 });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "mov-1", userId: "user-1", kind: "deposit" });
    expect(state.limits).toEqual([10]);
  });
});
