import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Compuerta de producción del dinero real.
 *
 * La ejecución real tiene DOS condiciones: `REAL_EXECUTION_UNLOCKED=true` en
 * el entorno Y las compuertas de Supabase (coherencia de `compliance_config`,
 * perfil con declaración vigente, `trading_enabled`, beta y límites). Estos
 * tests vigilan que:
 * - sin la variable, la compuerta sigue cerrada y no se consulta Supabase;
 * - con la variable, la guardia deja de lanzar pero igual exige la
 *   configuración de la base;
 * - los kill switches (trading / salidas) responden con su código propio.
 *
 * Ningún test abre Supabase ni sale a la red: el cliente admin es falso y se
 * configura fila por fila. `process.env.REAL_EXECUTION_UNLOCKED` se restaura
 * siempre en `afterEach`.
 */

const CURRENT = "2026-11-vigente";
const ORIGINAL_UNLOCK = process.env.REAL_EXECUTION_UNLOCKED;

const VALID_PROFILE = {
  onboarding_completed: true,
  is_us_person: false,
  us_person_declaration_version: CURRENT,
  us_person_declared_at: "2026-11-01T12:00:00.000Z",
};

type CountedOrder = { amountUsd: number; status: string; createdAt: string };

/**
 * Estado mutable compartido con los mocks (vi.hoisted corre antes de los
 * imports, así el mismo objeto sobrevive a `vi.resetModules()`).
 */
const gate = vi.hoisted(() => {
  type Row = Record<string, unknown> | null;
  type Chain = {
    select: () => Chain;
    eq: () => Chain;
    maybeSingle: () => Promise<{ data: Row; error: Error | null }>;
  };

  const state = {
    /** Campo de `serverEnv` que ve la guardia (versión vigente del servidor). */
    env: {
      DATA_MODE: "live" as string,
      US_PERSON_DECLARATION_VERSION: "2026-11-vigente" as string,
    },
    /** Filas que devuelve el cliente admin falso. */
    complianceVersion: "2026-11-vigente" as string | null,
    profile: null as Row,
    failComplianceRead: false,
    /** Tablas consultadas, en orden: sirve para probar que no se tocó la base. */
    tables: [] as string[],
    limitsRow: null as Record<string, unknown> | null,
    orders: [] as CountedOrder[],
    globalOrders: [] as CountedOrder[],
    betaUser: false,
    flags: {
      trading_enabled: true,
      beta_only: false,
      withdrawals_enabled: true,
    } as Record<string, boolean>,
  };

  function chainFor(row: Row, error: Error | null = null): Chain {
    const chain: Chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: row, error }),
    };
    return chain;
  }

  const createSupabaseAdminClient = vi.fn(() => ({
    from(table: string) {
      state.tables.push(table);
      if (table === "compliance_config") {
        if (state.failComplianceRead) return chainFor(null, new Error("sin permisos"));
        return chainFor({ us_person_declaration_version: state.complianceVersion });
      }
      return chainFor(state.profile);
    },
  }));

  return { state, createSupabaseAdminClient };
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: gate.createSupabaseAdminClient,
}));

vi.mock("@/lib/env", () => ({ serverEnv: gate.state.env }));

vi.mock("@/lib/flags", () => ({
  getFlag: async (key: string) => gate.state.flags[key] ?? false,
}));

vi.mock("@/lib/admin/store", () => ({
  readFlagValue: async (key: string) => {
    if (key === "limits_default") return { per_order_usd: 200, daily_usd: 500, monthly_usd: 2000 };
    if (key === "global_daily_usd") return 10_000;
    return undefined;
  },
  readUserLimitsRow: async () => gate.state.limitsRow,
  isBetaUser: async () => gate.state.betaUser,
  toUserLimitsRow: (row: Record<string, unknown>) => {
    const userId = typeof row.user_id === "string" ? row.user_id : "";
    if (!userId) return null;
    const positiveOrNull = (value: unknown): number | null => {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    return {
      user_id: userId,
      per_order_usd: positiveOrNull(row.per_order_usd),
      daily_usd: positiveOrNull(row.daily_usd),
      monthly_usd: positiveOrNull(row.monthly_usd),
      note: null,
      updated_at: null,
    };
  },
}));

vi.mock("@/lib/services/orders.supabase", () => ({
  listOrdersForLimits: async () => gate.state.orders,
  listAllOrdersForLimits: async () => gate.state.globalOrders,
}));

vi.mock("@/lib/services/trade-reservations.supabase", () => ({
  createTradeReservationStore: () => ({
    read: async () => null,
    reserve: async () => null,
    release: async () => true,
  }),
  listActiveReservationsForLimits: async () => [],
  listAllActiveReservationsForLimits: async () => [],
}));

/**
 * `REAL_EXECUTION_LOCKED` se evalúa al importar el módulo, así que cada caso
 * carga la guardia con el entorno que quiere probar. Los `vi.mock` siguen
 * vigentes después de `resetModules`.
 */
async function loadGuards(): Promise<typeof import("@/lib/trade/real-guards")> {
  vi.resetModules();
  return import("@/lib/trade/real-guards");
}

async function loadLockedGuards() {
  delete process.env.REAL_EXECUTION_UNLOCKED;
  return loadGuards();
}

async function loadUnlockedGuards() {
  process.env.REAL_EXECUTION_UNLOCKED = "true";
  return loadGuards();
}

/** Captura el error síncrono sin depender de la identidad de la clase. */
function caughtError(run: () => void): unknown {
  try {
    run();
    return null;
  } catch (error) {
    return error;
  }
}

beforeEach(() => {
  gate.createSupabaseAdminClient.mockClear();
  gate.state.env.DATA_MODE = "live";
  gate.state.env.US_PERSON_DECLARATION_VERSION = CURRENT;
  gate.state.complianceVersion = CURRENT;
  gate.state.profile = { ...VALID_PROFILE };
  gate.state.failComplianceRead = false;
  gate.state.tables = [];
  gate.state.limitsRow = null;
  gate.state.orders = [];
  gate.state.globalOrders = [];
  gate.state.betaUser = false;
  gate.state.flags = {
    trading_enabled: true,
    beta_only: false,
    withdrawals_enabled: true,
  };
  delete process.env.REAL_EXECUTION_UNLOCKED;
});

afterEach(() => {
  // Nunca dejar el desbloqueo pegado para los demás archivos de la suite.
  if (ORIGINAL_UNLOCK === undefined) delete process.env.REAL_EXECUTION_UNLOCKED;
  else process.env.REAL_EXECUTION_UNLOCKED = ORIGINAL_UNLOCK;
  vi.resetModules();
});

describe("candado cerrado (default fail-closed)", () => {
  it("sin REAL_EXECUTION_UNLOCKED la compuerta sigue cerrada", async () => {
    const guards = await loadLockedGuards();

    expect(guards.REAL_EXECUTION_LOCKED).toBe(true);
    expect(guards.isRealExecutionLocked()).toBe(true);

    const error = caughtError(() => guards.assertRealExecutionLocked());
    expect(error).toBeInstanceOf(Error);
    // No se compara la clase: `vi.resetModules()` crea otra instancia de
    // DomainError. Se verifica la forma que ve la ruta (503 REAL_DISABLED).
    expect(error).toMatchObject({
      name: "DomainError",
      code: "REAL_DISABLED",
      message: "El dinero real todavía no está disponible.",
    });
  });

  it("con el candado cerrado no se consulta Supabase", async () => {
    const guards = await loadLockedGuards();

    await expect(guards.assertRealTradeAllowed("user-1", 100)).rejects.toMatchObject({
      code: "REAL_DISABLED",
    });

    expect(gate.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(gate.state.tables).toEqual([]);
  });
});

describe("candado abierto por entorno", () => {
  it("con REAL_EXECUTION_UNLOCKED=true la guardia no lanza", async () => {
    const guards = await loadUnlockedGuards();

    expect(guards.REAL_EXECUTION_LOCKED).toBe(false);
    expect(guards.isRealExecutionLocked()).toBe(false);
    expect(caughtError(() => guards.assertRealExecutionLocked())).toBeNull();
  });

  it("no basta la variable: sin compliance_config legible sigue bloqueado", async () => {
    gate.state.failComplianceRead = true;
    // La guardia deja un aviso en el log del servidor; aquí no interesa.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const guards = await loadUnlockedGuards();

      await expect(guards.assertRealTradeAllowed("user-1", 100)).rejects.toMatchObject({
        code: "REAL_DISABLED",
      });

      // Sólo se intentó leer la configuración; no se llegó al perfil ni a flags.
      expect(gate.state.tables).toEqual(["compliance_config"]);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("compliance_config + perfil válidos + trading en beta off + límites que pasan: resuelve", async () => {
    const guards = await loadUnlockedGuards();

    await expect(guards.assertRealTradeAllowed("user-1", 100)).resolves.toBeUndefined();

    // Coherencia de la declaración antes de la evidencia de la persona.
    expect(gate.state.tables).toEqual(["compliance_config", "profiles"]);
  });

  it("trading_enabled=false responde TRADING_PAUSED", async () => {
    gate.state.flags.trading_enabled = false;
    const guards = await loadUnlockedGuards();

    await expect(guards.assertRealTradeAllowed("user-1", 100)).rejects.toMatchObject({
      code: "TRADING_PAUSED",
    });
  });

  it("salidas: con withdrawals_enabled=true el retiro queda habilitado", async () => {
    const guards = await loadUnlockedGuards();

    await expect(guards.assertRealWithdrawalsEnabled()).resolves.toBeUndefined();
  });

  it("salidas: con withdrawals_enabled=false el retiro se bloquea", async () => {
    gate.state.flags.withdrawals_enabled = false;
    const guards = await loadUnlockedGuards();

    await expect(guards.assertRealWithdrawalsEnabled()).rejects.toMatchObject({
      code: "REAL_DISABLED",
    });
  });
});
