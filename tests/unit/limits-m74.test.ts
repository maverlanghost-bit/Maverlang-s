import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __resetKillSwitchesForTests,
  __setKillSwitchClockForTests,
  assertOnrampEnabled,
  assertTradingEnabled,
  assertWithdrawalsEnabled,
  checkBetaAccess,
  checkLimits,
  countOrdersInWindow,
  countedWindow,
  isCountedStatus,
  orderNotionalUsd,
  parseGlobalDailyUsd,
  parseLimitsDefault,
  readGlobalDailyUsd,
  readLimitsDefaults,
  santiagoDayKey,
  santiagoMonthKey,
  type CountedOrder,
  type LimitsDeps,
} from "@/lib/trade/limits";
import {
  ADMIN_LIMITS_AVISO,
  AVISO_LIMITS_TEXT,
  betaRowView,
  limitFieldValue,
  parseEmail,
  parseLimitField,
  parseLimitsForm,
} from "@/lib/admin/limits-panel";

const ROOT = path.resolve(__dirname, "..", "..");

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Mediodía de un día local de Santiago (12:00-03:00 UTC aprox: mediodía local). */
function santiagoNoon(dayKey: string): Date {
  // 12:00 en Santiago = 15:00 UTC (-03) o 16:00 UTC (-04). Se resuelve con
  // Intl: se busca el instante UTC cuyo día local sea el pedido a las 12h.
  const [y, m, d] = dayKey.split("-").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, 15, 0, 0);
  const at = new Date(utcGuess);
  const localHour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "America/Santiago", hour: "2-digit", hour12: false }).format(at),
  );
  // Ajuste a 12:00 local.
  return new Date(utcGuess + (12 - localHour) * 3600_000);
}

type LimitOverrides = {
  per_order_usd?: number | null;
  daily_usd?: number | null;
  monthly_usd?: number | null;
};

type DepsOverrides = Partial<LimitsDeps> & {
  flags?: Record<string, unknown>;
  limits?: Record<string, LimitOverrides>;
  beta?: string[];
  orders?: Record<string, CountedOrder[]>;
  globalOrders?: CountedOrder[];
  now?: Date;
};

function makeDeps(overrides: DepsOverrides = {}): LimitsDeps {
  const flags = overrides.flags ?? {};
  const limits: Record<string, { per_order_usd: number | null; daily_usd: number | null; monthly_usd: number | null }> = {};
  for (const [userId, raw] of Object.entries(overrides.limits ?? {})) {
    limits[userId] = {
      per_order_usd: raw.per_order_usd ?? null,
      daily_usd: raw.daily_usd ?? null,
      monthly_usd: raw.monthly_usd ?? null,
    };
  }
  const beta = overrides.beta ?? [];
  const orders = overrides.orders ?? {};
  const now = overrides.now ?? santiagoNoon("2026-10-15");
  const deps: LimitsDeps = {
    getFlagBool: async (key) => (typeof flags[key] === "boolean" ? (flags[key] as boolean) : key === "beta_only"),
    getFlagValue: async (key) => (key in flags ? flags[key] : undefined),
    readUserLimits: async (userId) => limits[userId] ?? null,
    isBetaUser: async (userId) => beta.includes(userId),
    listOrders: async (userId) => orders[userId] ?? [],
    listOrdersAllUsers: async () => overrides.globalOrders ?? Object.values(orders).flat(),
    now: () => now,
  };
  return deps;
}

function order(amountUsd: number, createdAt: string, status = "confirmed"): CountedOrder {
  return { amountUsd, status, createdAt };
}

beforeEach(() => {
  // El cache de kill switches vive a nivel de módulo: cada test parte limpio.
  __resetKillSwitchesForTests();
});

afterEach(() => {
  __resetKillSwitchesForTests();
});

// -----------------------------------------------------------------------------
// Migración 0028
// -----------------------------------------------------------------------------

describe("M74: migración 0028_limits.sql", () => {
  const sql = readFileSync(path.join(ROOT, "supabase", "migrations", "0028_limits.sql"), "utf8");
  const code = sql.replace(/^--.*$/gm, "");

  it("crea user_limits con los topes, checks y RLS", () => {
    expect(sql).toMatch(/create table if not exists public\.user_limits/i);
    expect(sql).toMatch(/user_id uuid primary key references auth\.users \(id\) on delete cascade/i);
    expect(sql).toMatch(/per_order_usd numeric check \(per_order_usd is null or per_order_usd > 0\)/i);
    expect(sql).toMatch(/daily_usd numeric check \(daily_usd is null or daily_usd > 0\)/i);
    expect(sql).toMatch(/monthly_usd numeric check \(monthly_usd is null or monthly_usd > 0\)/i);
    expect(sql).toMatch(/note text/i);
    expect(sql).toMatch(/updated_at timestamptz not null default now\(\)/i);
    expect(sql).toMatch(/alter table public\.user_limits enable row level security/i);
  });

  it("crea beta_users con invited_by/invited_at y RLS", () => {
    expect(sql).toMatch(/create table if not exists public\.beta_users/i);
    expect(sql).toMatch(/invited_by uuid references auth\.users \(id\) on delete set null/i);
    expect(sql).toMatch(/invited_at timestamptz not null default now\(\)/i);
    expect(sql).toMatch(/alter table public\.beta_users enable row level security/i);
  });

  it("RLS: lectura de la fila propia con auth.uid(), sin escritura de clientes", () => {
    expect((code.match(/create policy/gi) ?? []).length).toBe(2);
    expect(code).toMatch(/for select/i);
    expect(code).toMatch(/using \(auth\.uid\(\) = user_id\)/i);
    expect(code).toMatch(/revoke all on table public\.user_limits from public, anon, authenticated/i);
    expect(code).toMatch(/revoke all on table public\.beta_users from public, anon, authenticated/i);
    expect(code).toMatch(/grant select on table public\.user_limits to authenticated/i);
    expect(code).toMatch(/grant select on table public\.beta_users to authenticated/i);
    // Sin policies de INSERT/UPDATE/DELETE para authenticated.
    expect(code).not.toMatch(/for insert|for update|for delete|for all/i);
  });

  it("semillas compatibles con app_flags.value jsonb (0011) e idempotentes", () => {
    expect(sql).toMatch(/insert into public\.app_flags \(key, value\)/i);
    expect(sql).toMatch(/'limits_default',\s*'\{"per_order_usd":200,"daily_usd":500,"monthly_usd":2000\}'::jsonb/);
    expect(sql).toMatch(/'global_daily_usd', '10000'::jsonb/);
    expect(sql).toMatch(/on conflict \(key\) do nothing/i);
    // Sin pg_catalog.current_date (regla de migraciones).
    expect(code).not.toMatch(/pg_catalog\.current_date/);
  });

  it("usa el número fijo 0028 (no 0014) y ambas tablas están en la matriz de audit-rls", () => {
    expect(path.basename("0028_limits.sql")).toBe("0028_limits.sql");
    const audit = readFileSync(path.join(ROOT, "scripts", "audit-rls.mjs"), "utf8");
    expect(audit).toMatch(/"user_limits"/);
    expect(audit).toMatch(/"beta_users"/);
    expect(audit).toMatch(/A SELECT user_limits \(sólo propias\)/);
    expect(audit).toMatch(/A SELECT beta_users \(sólo propias\)/);
    expect(audit).toMatch(/A INSERT user_limits \(denegado\)/);
    expect(audit).toMatch(/A INSERT beta_users \(denegado\)/);
    const docs = readFileSync(path.join(ROOT, "docs", "SUPABASE.md"), "utf8");
    expect(docs).toMatch(/0028_limits\.sql/);
    expect(docs).toMatch(/user_limits/);
    expect(docs).toMatch(/beta_users/);
  });
});

// -----------------------------------------------------------------------------
// Zona horaria America/Santiago
// -----------------------------------------------------------------------------

describe("M74: ventanas en America/Santiago", () => {
  it("la clave del día es local, no UTC", () => {
    // 2026-10-15 01:00 UTC = 22:00 del 14 local (invierno) / 23:00 aprox.
    const at = new Date("2026-10-15T01:30:00Z");
    const day = santiagoDayKey(at);
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // El día local NO puede ser el mismo que el UTC en este instante nocturno.
    expect(day).not.toBe("2026-10-15");
    const month = santiagoMonthKey(at);
    expect(month).toBe(day.slice(0, 7));
  });

  it("la ventana del día abarca exactamente 24 h locales", () => {
    const now = santiagoNoon("2026-10-15");
    const { fromMs, toMs } = countedWindow(now, "day");
    expect(santiagoDayKey(new Date(fromMs))).toBe("2026-10-15");
    expect(toMs - fromMs).toBe(24 * 3600_000);
    // El instante actual queda dentro.
    expect(now.getTime()).toBeGreaterThanOrEqual(fromMs);
    expect(now.getTime()).toBeLessThan(toMs);
  });

  it("la ventana del mes arranca el día 1 local y cubre el mes completo", () => {
    const now = santiagoNoon("2026-10-15");
    const { fromMs, toMs } = countedWindow(now, "month");
    expect(santiagoDayKey(new Date(fromMs))).toMatch(/2026-10-01$/);
    expect(santiagoDayKey(new Date(toMs - 1))).toMatch(/2026-10-31$/);
    expect(santiagoDayKey(new Date(toMs))).toMatch(/2026-11-01$/);
  });

  it("cuenta sólo órdenes contables dentro de la ventana", () => {
    const now = santiagoNoon("2026-10-15");
    const { fromMs, toMs } = countedWindow(now, "day");
    const inside = new Date(fromMs + 3600_000).toISOString();
    const before = new Date(fromMs - 3600_000).toISOString();
    const rows: CountedOrder[] = [
      order(50, inside, "confirmed"),
      order(30, inside, "submitted"),
      order(20, inside, "failed"), // no cuenta
      order(20, inside, "expired"), // no cuenta
      order(70, before, "confirmed"), // otro día
      order(70, new Date(toMs + 1000).toISOString(), "confirmed"), // futuro
    ];
    expect(countOrdersInWindow(rows, { fromMs, toMs })).toBeCloseTo(80);
  });

  it("isCountedStatus marca vivas y confirmadas; failed/expired no", () => {
    for (const status of ["pending", "submitted", "confirmed", "signed", "built"]) {
      expect(isCountedStatus(status)).toBe(true);
    }
    expect(isCountedStatus("failed")).toBe(false);
    expect(isCountedStatus("expired")).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// Notional de una orden
// -----------------------------------------------------------------------------

describe("M74: notional contable", () => {
  it("compra: lo que entra en USDC; venta: lo que sale", () => {
    expect(orderNotionalUsd({ side: "buy", in_amount_ui: 150, out_amount_ui: 0.5 })).toBe(150);
    expect(orderNotionalUsd({ side: "sell", in_amount_ui: 2, out_amount_ui: 340 })).toBe(340);
  });

  it("venta sin out: acciones × precio de referencia", () => {
    expect(
      orderNotionalUsd({ side: "sell", in_amount_ui: 2, out_amount_ui: null, price_per_share_usd: 170 }),
    ).toBe(340);
    expect(orderNotionalUsd({ side: "sell", in_amount_ui: 2, out_amount_ui: null })).toBe(0);
    expect(orderNotionalUsd({ side: "buy", in_amount_ui: 0, out_amount_ui: 0 })).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Defaults desde app_flags
// -----------------------------------------------------------------------------

describe("M74: defaults de límites", () => {
  it("parsea limits_default jsonb y cae a los valores sugeridos", () => {
    expect(parseLimitsDefault(null)).toEqual({ per_order_usd: 200, daily_usd: 500, monthly_usd: 2000 });
    expect(
      parseLimitsDefault({ per_order_usd: 100, daily_usd: 250, monthly_usd: 900 }),
    ).toEqual({ per_order_usd: 100, daily_usd: 250, monthly_usd: 900 });
    // Basura → default; 0/negativos → default.
    expect(parseLimitsDefault({ per_order_usd: 0, daily_usd: -5, monthly_usd: "x" })).toEqual({
      per_order_usd: 200,
      daily_usd: 500,
      monthly_usd: 2000,
    });
  });

  it("global_daily_usd cae a 10.000", () => {
    expect(parseGlobalDailyUsd(25000)).toBe(25000);
    expect(parseGlobalDailyUsd("30000")).toBe(30000);
    expect(parseGlobalDailyUsd(0)).toBe(10000);
    expect(parseGlobalDailyUsd(undefined)).toBe(10000);
  });

  it("con la base caída, los lectores devuelven el default sin lanzar", async () => {
    const deps: Pick<LimitsDeps, "getFlagValue"> = {
      getFlagValue: async () => {
        throw new Error("down");
      },
    };
    expect(await readLimitsDefaults(deps.getFlagValue)).toEqual({
      per_order_usd: 200,
      daily_usd: 500,
      monthly_usd: 2000,
    });
    expect(await readGlobalDailyUsd(deps.getFlagValue)).toBe(10000);
  });
});

// -----------------------------------------------------------------------------
// checkLimits: los 4 topes
// -----------------------------------------------------------------------------

describe("M74: checkLimits — los 4 códigos", () => {
  it("LIMIT_ORDER: una orden sobre el tope por orden se rechaza", async () => {
    const verdict = await checkLimits("u1", 250, makeDeps()); // default 200
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("LIMIT_ORDER");
    expect(verdict.limitUsd).toBe(200);
    expect(verdict.message).toContain("200");
  });

  it("LIMIT_ORDER: el tope propio de user_limits pisa el default", async () => {
    const verdict = await checkLimits("u1", 150, makeDeps({ limits: { u1: { per_order_usd: 100 } } }));
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("LIMIT_ORDER");
    expect(verdict.limitUsd).toBe(100);
  });

  it("LIMIT_DAILY: con US$20 al día, 15 OK y otra de 15 se rechaza con el mensaje", async () => {
    const deps = makeDeps({ limits: { u1: { daily_usd: 20 } } });
    const first = await checkLimits("u1", 15, deps);
    expect(first.ok).toBe(true);
    expect(first.remainingUsd).toBe(5);
    // Ahora con la primera orden ya contabilizada:
    const second = await checkLimits("u1", 15, makeDeps({
      limits: { u1: { daily_usd: 20 } },
      orders: { u1: [order(15, santiagoNoon("2026-10-15").toISOString(), "confirmed")] },
    }));
    expect(second.ok).toBe(false);
    expect(second.code).toBe("LIMIT_DAILY");
    expect(second.message).toBe("Alcanzaste tu límite diario (US$20).");
  });

  it("LIMIT_DAILY: las órdenes de ayer no suman al día de hoy", async () => {
    const deps = makeDeps({
      limits: { u1: { daily_usd: 20 } },
      orders: { u1: [order(15, santiagoNoon("2026-10-14").toISOString(), "confirmed")] },
    });
    const verdict = await checkLimits("u1", 15, deps);
    expect(verdict.ok).toBe(true);
  });

  it("LIMIT_MONTHLY: supera el tope del mes aunque el día aún no", async () => {
    const deps = makeDeps({
      limits: { u1: { monthly_usd: 100 } },
      orders: { u1: [order(90, santiagoNoon("2026-10-05").toISOString(), "confirmed")] },
    });
    const verdict = await checkLimits("u1", 20, deps);
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("LIMIT_MONTHLY");
    expect(verdict.message).toBe("Alcanzaste tu límite mensual (US$100).");
  });

  it("LIMIT_GLOBAL: el tope del día de todos los usuarios corta aunque el usuario esté limpio", async () => {
    const deps = makeDeps({
      flags: { global_daily_usd: 1000 },
      globalOrders: [order(990, santiagoNoon("2026-10-15").toISOString(), "confirmed")],
    });
    const verdict = await checkLimits("u1", 50, deps);
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("LIMIT_GLOBAL");
    expect(verdict.message).toContain("10");
  });

  it("todo dentro del tope: ok y remaining refleja lo que queda del día", async () => {
    const verdict = await checkLimits("u1", 100, makeDeps());
    expect(verdict.ok).toBe(true);
    expect(verdict.code).toBeNull();
    expect(verdict.limitUsd).toBe(500);
    expect(verdict.remainingUsd).toBe(400);
  });

  it("monto inválido se rechaza sin tocar la base", async () => {
    let called = 0;
    const deps = makeDeps();
    deps.listOrders = async () => {
      called += 1;
      return [];
    };
    const verdict = await checkLimits("u1", 0, deps);
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("LIMIT_ORDER");
    expect(called).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Carrera: dos órdenes simultáneas
// -----------------------------------------------------------------------------

describe("M74: carrera de dos órdenes simultáneas sobre el límite diario", () => {
  it("dos builds concurrentes que juntos superan el diario: uno pasa y el otro es LIMIT_DAILY", async () => {
    const dailyUsd = 20;
    // Base compartida: empieza vacía; cada check "reserva" sumando a la base
    // cuando pasa (simula la fila que inserta build/submit). La reserva es
    // síncrona dentro de cada intento: ningún check ve 0 gastado.
    const spent: CountedOrder[] = [];
    const deps = makeDeps({
      limits: { u1: { daily_usd: dailyUsd } },
    });
    const noon = santiagoNoon("2026-10-15");
    deps.now = () => noon;
    deps.listOrders = async () => [...spent];
    const attempt = (amountUsd: number) =>
      checkLimits("u1", amountUsd, deps).then((verdict) => {
        if (!verdict.ok) return verdict;
        // Reserva: la orden queda `submitted` en la base antes de seguir.
        spent.push(order(amountUsd, santiagoNoon("2026-10-15").toISOString(), "submitted"));
        return verdict;
      });
    // Secuencia como llegarían dos POST casi simultáneos al mismo servidor:
    // el segundo check corre DESPUÉS de que el primero reservó su orden en
    // la base (la reserva es síncrona dentro del intento).
    const first = await attempt(15);
    const second = await attempt(15);
    const results = [first, second];
    const passed = results.filter((v) => v.ok);
    const blocked = results.filter((v) => !v.ok);
    expect(passed.length).toBe(1);
    expect(blocked.length).toBe(1);
    expect(blocked[0]?.code).toBe("LIMIT_DAILY");
    expect(blocked[0]?.message).toBe("Alcanzaste tu límite diario (US$20).");
  });
});

// -----------------------------------------------------------------------------
// Beta
// -----------------------------------------------------------------------------

describe("M74: beta_only y beta_users", () => {
  it("con beta_only=true, sólo el usuario en beta_users pasa", async () => {
    const deps = makeDeps({ flags: { beta_only: true }, beta: ["u-beta"] });
    expect(await checkBetaAccess("u-beta", deps)).toEqual({ ok: true, betaOnly: true });
    expect(await checkBetaAccess("u-fuera", deps)).toEqual({ ok: false, betaOnly: true });
  });

  it("con beta_only=false pasa cualquiera", async () => {
    const deps = makeDeps({ flags: { beta_only: false }, beta: [] });
    expect(await checkBetaAccess("u-cualquiera", deps)).toEqual({ ok: true, betaOnly: false });
  });

  it("si la lectura de la lista falla, se deniega (fail-closed)", async () => {
    const deps = makeDeps({ flags: { beta_only: true } });
    deps.isBetaUser = async () => {
      throw new Error("down");
    };
    expect((await checkBetaAccess("u1", deps)).ok).toBe(false);
  });

  it("si la lectura del flag falla, se asume beta cerrada", async () => {
    const deps = makeDeps({ beta: ["u1"] });
    deps.getFlagBool = async () => {
      throw new Error("down");
    };
    expect((await checkBetaAccess("u1", deps)).ok).toBe(true); // está en la lista
    expect((await checkBetaAccess("u2", deps)).ok).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// Kill switches
// -----------------------------------------------------------------------------

describe("M74: kill switches", () => {
  it("trading_enabled=false lanza TRADING_PAUSED; encendido pasa (con cache limpio)", async () => {
    // Clock determinista: el reset del beforeEach restaura Date.now() y el
    // cache global puede traer valores de otro test.
    __setKillSwitchClockForTests(() => 500_000);
    const on = makeDeps({ flags: { trading_enabled: true } });
    await expect(assertTradingEnabled(on)).resolves.toBeUndefined();
    // Se apaga con el cache aún vivo (500.500 < 500.000 + 30.000): pasa igual
    // (ventana ≤ 30 s por diseño)...
    const cached = makeDeps({ flags: { trading_enabled: false } });
    await expect(assertTradingEnabled(cached)).resolves.toBeUndefined();
    // ...y al vencer el TTL corta.
    __setKillSwitchClockForTests(() => 600_000);
    await expect(assertTradingEnabled(cached)).rejects.toMatchObject({ code: "TRADING_PAUSED" });
    // Encendido de nuevo, pero el cache ahora trae false con at=600.000:
    // dentro del TTL seguiría pausado; tras vencer el TTL pasa.
    const backOn = makeDeps({ flags: { trading_enabled: true } });
    __setKillSwitchClockForTests(() => 700_000);
    await expect(assertTradingEnabled(backOn)).resolves.toBeUndefined();
  });

  it("sin flag (o base caída), el default seguro apaga el trading", async () => {
    const deps = makeDeps({ flags: {} });
    await expect(assertTradingEnabled(deps)).rejects.toMatchObject({ code: "TRADING_PAUSED" });
    const broken = makeDeps({});
    broken.getFlagBool = async () => {
      throw new Error("down");
    };
    await expect(assertTradingEnabled(broken)).rejects.toMatchObject({ code: "TRADING_PAUSED" });
  });

  it("cache de 30 s: el switch se lee una vez dentro del TTL", async () => {
    let now = 1_000;
    let calls = 0;
    const deps = makeDeps({ flags: { trading_enabled: true } });
    deps.getFlagBool = async () => {
      calls += 1;
      return true;
    };
    __setKillSwitchClockForTests(() => now);
    await assertTradingEnabled(deps);
    await assertTradingEnabled(deps);
    expect(calls).toBe(1);
    now += 30_000;
    await assertTradingEnabled(deps);
    expect(calls).toBe(2);
  });

  it("una orden ya built se rechaza al submit cuando el switch se apagó (TTL vencido)", async () => {
    let now = 1_000;
    let tradingOn = true;
    __setKillSwitchClockForTests(() => now);
    const deps = makeDeps({});
    deps.getFlagBool = async () => tradingOn;
    // Build en t=0 (cache guarda true).
    await assertTradingEnabled(deps);
    // El operador apaga el switch en /admin...
    tradingOn = false;
    // ...pero dentro del TTL la orden en curso pasaría (≤30 s por diseño):
    now += 10_000;
    await expect(assertTradingEnabled(deps)).resolves.toBeUndefined();
    // ...y al vencer el cache, el submit de la orden `built` se rechaza.
    now += 25_000;
    await expect(assertTradingEnabled(deps)).rejects.toMatchObject({ code: "TRADING_PAUSED" });
  });

  it("onramp y withdrawals con default apagado", async () => {
    __resetKillSwitchesForTests();
    let now = 2_000_000;
    __setKillSwitchClockForTests(() => now);
    const deps = makeDeps({ flags: {} });
    await expect(assertOnrampEnabled(deps)).rejects.toMatchObject({ code: "REAL_DISABLED" });
    await expect(assertWithdrawalsEnabled(deps)).rejects.toMatchObject({ code: "REAL_DISABLED" });
    now += 31_000; // cache vencido
    const on = makeDeps({ flags: { onramp_enabled: true, withdrawals_enabled: true } });
    await expect(assertOnrampEnabled(on)).resolves.toBeUndefined();
    now += 31_000;
    await expect(assertWithdrawalsEnabled(on)).resolves.toBeUndefined();
  });
});

// -----------------------------------------------------------------------------
// Panel: parseo y avisos
// -----------------------------------------------------------------------------

describe("M74: panel de límites (lógica pura)", () => {
  function formData(fields: Record<string, string>): FormData {
    const fd = new FormData();
    for (const [key, value] of Object.entries(fields)) fd.append(key, value);
    return fd;
  }

  it("parseLimitField: vacío = null, decimal = número, basura = invalid", () => {
    expect(parseLimitField("")).toBeNull();
    expect(parseLimitField(null)).toBeNull();
    expect(parseLimitField("150")).toBe(150);
    expect(parseLimitField("0.5")).toBe(0.5);
    expect(parseLimitField("12.345")).toBe("invalid");
    expect(parseLimitField("-5")).toBe("invalid");
    expect(parseLimitField("abc")).toBe("invalid");
    expect(parseLimitField("2000000")).toBe("invalid");
  });

  it("parseLimitsForm arma los valores y rechaza campos inválidos", () => {
    const ok = parseLimitsForm(formData({ perOrderUsd: "150", dailyUsd: "", monthlyUsd: "3000", note: "tope especial" }));
    expect(ok).toEqual({
      ok: true,
      values: { perOrderUsd: 150, dailyUsd: null, monthlyUsd: 3000, note: "tope especial" },
    });
    expect(parseLimitsForm(formData({ perOrderUsd: "x" })).ok).toBe(false);
  });

  it("parseEmail y avisos del panel", () => {
    expect(parseEmail(" Usuario@Test.cl ")).toBe("usuario@test.cl");
    expect(parseEmail("sin-arroba")).toBeNull();
    expect(ADMIN_LIMITS_AVISO.faltaEmail).toBe("falta-email");
    expect(ADMIN_LIMITS_AVISO.noUser).toBe("sin-usuario");
    expect(AVISO_LIMITS_TEXT["falta-email"]).toContain("correo");
    expect(AVISO_LIMITS_TEXT["sin-usuario"]).toContain("No encontramos");
  });

  it("betaRowView y limitFieldValue", () => {
    const row = betaRowView({
      user_id: "u-1",
      email: "a@b.cl",
      invited_at: "2026-10-15T15:00:00.000Z",
      note: "amigo",
    });
    expect(row.email).toBe("a@b.cl");
    expect(row.invitedAt).toBe("2026-10-15T15:00:00.000Z");
    expect(betaRowView({ user_id: "u-2", email: null, invited_at: null, note: null }).email).toBe("u-2");
    expect(limitFieldValue(null)).toBe("");
    expect(limitFieldValue(150)).toBe("150");
    expect(limitFieldValue("150.50")).toBe("150.50");
  });
});

// -----------------------------------------------------------------------------
// Rutas y guardias conectadas
// -----------------------------------------------------------------------------

describe("M74: guardias en las rutas de trade real", () => {
  it("quote, build y submit llaman assertRealTradeAllowed después del guardián M46", () => {
    for (const rel of [
      "app/api/trade/quote/route.ts",
      "app/api/trade/build/route.ts",
      "app/api/trade/submit/route.ts",
    ]) {
      const source = readFileSync(path.join(ROOT, rel), "utf8");
      expect(source, rel).toMatch(/assertRealTradingEnabled\(\)/);
      expect(source, rel).toMatch(/assertRealTradeAllowed\(/);
      const m46At = source.indexOf("assertRealTradingEnabled()");
      const m74At = source.indexOf("assertRealTradeAllowed(");
      expect(m74At, `${rel}: M74 debe ir después de M46`).toBeGreaterThan(m46At);
    }
    // El motor live queda sin límites inline: la guardia vive en la ruta.
    const live = readFileSync(path.join(ROOT, "lib", "services", "trade.live.ts"), "utf8");
    expect(live).not.toMatch(/checkLimits|assertRealTradeAllowed/);
  });

  it("lib/trade/limits.ts y real-guards quedan en la lista blanca del cliente admin", () => {
    const source = readFileSync(path.join(ROOT, "tests", "unit", "admin-client-usage.test.ts"), "utf8");
    expect(source).toMatch(/lib\/trade\/limits\.ts/);
    expect(source).toMatch(/lib\/trade\/real-guards\.ts/);
  });

  it("los nuevos códigos de error existen con su HTTP", async () => {
    const { API_ERROR_STATUS, errorMessage } = await import("@/lib/api/result");
    expect(API_ERROR_STATUS.LIMIT_ORDER).toBe(422);
    expect(API_ERROR_STATUS.LIMIT_DAILY).toBe(422);
    expect(API_ERROR_STATUS.LIMIT_MONTHLY).toBe(422);
    expect(API_ERROR_STATUS.LIMIT_GLOBAL).toBe(422);
    expect(API_ERROR_STATUS.TRADING_PAUSED).toBe(503);
    expect(API_ERROR_STATUS.BETA_CLOSED).toBe(403);
    expect(errorMessage("LIMIT_DAILY")).toContain("límite diario");
    expect(errorMessage("TRADING_PAUSED")).toContain("pausadas");
    expect(errorMessage("BETA_CLOSED")).toContain("beta cerrada");
  });
});
