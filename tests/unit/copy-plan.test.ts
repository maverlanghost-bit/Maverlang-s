import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { coverageOf, type MappedPosition } from "@/lib/copy/mapping";
import {
  COPY_MAX_LEGS_DEMO,
  COPY_MAX_LEGS_REAL,
  allocateCents,
  buildCopyPlan,
} from "@/lib/copy/plan";
import {
  COPY_PLAN_TTL_MS,
  signPlan,
  verifyPlan,
  verifyPlanDetailed,
} from "@/lib/copy/plan-token";
import type { CopyFamily, CopyPortfolio } from "@/lib/copy/types";

/**
 * Plan de mezcla (§2.3 y §3.1): mayor resto con suma exacta, mínimo US$1,
 * máximos 10/25, cobertura y umbrales 60/40, reparto de lo no disponible y
 * `planId` HMAC con TTL de 10 min ligado al usuario. Sin red: el mapeo se
 * inyecta ya resuelto y el token usa un secreto de prueba.
 */

const SLUG = "berkshire-hathaway-13f";
const VERSION_ID = `v1:${"a".repeat(64)}`;
const SECRET = "solo-test-plan-hmac-0123456789abcdef";
const NOW = Date.parse("2026-11-10T12:00:00.000Z");
const savedSecret = process.env.COPY_PLAN_HMAC_SECRET;

function portfolioOf(family: CopyFamily = "13f"): CopyPortfolio {
  return {
    versionId: VERSION_ID,
    generatedAt: "2026-11-10T11:00:00.000Z",
    portfolio: {
      slug: SLUG,
      aliases: [],
      name: "Cartera de ejemplo",
      family,
      source: "sec_13f",
      manager: "Gestor de ejemplo",
      country: "US",
      asOf: "2026-09-30",
      filedAt: "2026-11-01",
      publishedAt: "2026-11-01",
      lagDays: 32,
      lagNote: "Dato de ejemplo.",
      isEstimated: false,
      isComplete: true,
      isFrozen: false,
      coverage: family === "broker_cl" ? "broker_recommendation" : "full_13f",
      verification: "official_filing",
      license: "Dato de ejemplo",
      attribution: "Fraccion.si (ejemplo)",
      sourceUrl: "https://www.sec.gov/",
    },
    positions: [
      {
        symbol: "AAPL",
        name: "Apple",
        weight: 100,
        previousWeight: null,
        side: "long",
        currency: "USD",
        asOf: "2026-09-30",
      },
    ],
    movements: [],
    disclaimer: "Dato de ejemplo, no es recomendación.",
    example: true,
  };
}

function mapped(
  symbol: string,
  weightOriginal: number,
  status: MappedPosition["status"] = "available",
  tradableSymbol: string | null = status === "available" ? `${symbol}x` : null,
): MappedPosition {
  return {
    symbol,
    tradableSymbol,
    status,
    weightOriginal,
    weightMaverlang: status === "available" ? weightOriginal : 0,
  };
}

function centsOf(usd: number): number {
  return Math.round(usd * 100);
}

function sumLegCents(legs: ReadonlyArray<{ usd: number }>): number {
  return legs.reduce((sum, leg) => sum + centsOf(leg.usd), 0);
}

beforeEach(() => {
  process.env.COPY_PLAN_HMAC_SECRET = SECRET;
});

afterAll(() => {
  if (savedSecret === undefined) delete process.env.COPY_PLAN_HMAC_SECRET;
  else process.env.COPY_PLAN_HMAC_SECRET = savedSecret;
});

describe("allocateCents: mayor resto con suma exacta", () => {
  it("reparte proporcional y no pierde ni crea centavos", () => {
    expect(allocateCents([50, 30, 20], 10_000)).toEqual([5_000, 3_000, 2_000]);
  });

  it("con tercios, la diferencia entre piernas es de a lo más un centavo", () => {
    const cents = allocateCents([1, 1, 1], 100);
    expect(cents.reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(Math.max(...cents) - Math.min(...cents)).toBeLessThanOrEqual(1);
  });

  it("sin filas devuelve vacío y con presupuesto 0 devuelve ceros", () => {
    expect(allocateCents([], 500)).toEqual([]);
    expect(allocateCents([1, 2, 3], 0)).toEqual([0, 0, 0]);
  });

  it("pesos inválidos o negativos no rompen el reparto", () => {
    const cents = allocateCents([0, Number.NaN, -5, 1], 101);
    expect(cents.reduce((sum, value) => sum + value, 0)).toBe(101);
  });

  it("un total negativo es un error de validación", () => {
    expect(() => allocateCents([1], -1)).toThrow();
  });
});

describe("buildCopyPlan: mínimo US$1, máximos y reparto", () => {
  it("la suma de las piernas es exactamente el total", async () => {
    const plan = await buildCopyPlan({
      portfolio: portfolioOf(),
      totalUsd: 100,
      account: "demo",
      mapped: [mapped("A", 50), mapped("B", 30), mapped("C", 20)],
    });
    expect(plan.legs).toHaveLength(3);
    expect(sumLegCents(plan.legs)).toBe(10_000);
    expect(plan.unavailableUsd).toBe(0);
    expect(plan.maxLegs).toBe(COPY_MAX_LEGS_DEMO);
  });

  it("descarta la pierna bajo US$1 y re-reparte hasta que todas pasen", async () => {
    const plan = await buildCopyPlan({
      portfolio: portfolioOf(),
      totalUsd: 5,
      account: "demo",
      mapped: [mapped("A", 98), mapped("B", 1), mapped("C", 1)],
    });
    expect(plan.legs).toHaveLength(1);
    expect(plan.legs[0]).toMatchObject({ symbol: "Ax", usd: 5 });
    expect(sumLegCents(plan.legs)).toBe(500);
    expect(plan.warnings.join(" ")).toMatch(/US\$1/);
  });

  it("máximo 10 piernas en real y 25 en demo, con suma exacta", async () => {
    const mapeo: MappedPosition[] = [
      ...Array.from({ length: 10 }, (_, index) => mapped(`A${index}`, 5)),
      ...Array.from({ length: 20 }, (_, index) => mapped(`B${index}`, 2.5)),
    ];

    const real = await buildCopyPlan({
      portfolio: portfolioOf(),
      totalUsd: 300,
      account: "real",
      mapped: mapeo,
    });
    expect(real.maxLegs).toBe(COPY_MAX_LEGS_REAL);
    expect(real.legs).toHaveLength(10);
    expect(sumLegCents(real.legs)).toBe(30_000);

    const demo = await buildCopyPlan({
      portfolio: portfolioOf(),
      totalUsd: 300,
      account: "demo",
      mapped: mapeo,
    });
    expect(demo.maxLegs).toBe(COPY_MAX_LEGS_DEMO);
    expect(demo.legs).toHaveLength(25);
    expect(sumLegCents(demo.legs)).toBe(30_000);
  });

  it("cobertura ≥60: sin aviso de réplica parcial", async () => {
    const plan = await buildCopyPlan({
      portfolio: portfolioOf(),
      totalUsd: 100,
      account: "demo",
      mapped: [mapped("A", 50), mapped("B", 25), mapped("C", 25, "unavailable")],
    });
    expect(plan.coveragePct).toBe(75);
    expect(plan.legs).toHaveLength(2);
    expect(plan.warnings.join(" ")).not.toMatch(/réplica parcial/i);
  });

  it("cobertura 40–60: aviso ámbar «Réplica parcial» y sigue copiando", async () => {
    const plan = await buildCopyPlan({
      portfolio: portfolioOf(),
      totalUsd: 100,
      account: "demo",
      mapped: [mapped("A", 50), mapped("B", 50, "unavailable")],
    });
    expect(plan.coveragePct).toBe(50);
    expect(plan.legs).toHaveLength(1);
    expect(plan.warnings.join(" ")).toMatch(/réplica parcial/i);
  });

  it("bajo 40: plan sin piernas y «no se puede replicar bien»", async () => {
    const plan = await buildCopyPlan({
      portfolio: portfolioOf(),
      totalUsd: 100,
      account: "demo",
      mapped: [mapped("A", 30), mapped("B", 70, "unavailable")],
    });
    expect(plan.coveragePct).toBe(30);
    expect(plan.legs).toEqual([]);
    expect(plan.unavailableUsd).toBe(100);
    expect(plan.warnings.join(" ")).toMatch(/no se puede replicar bien/i);
  });

  it("«No repartir» deja lo no disponible en USDC; por defecto se reparte", async () => {
    const base = {
      portfolio: portfolioOf(),
      totalUsd: 100,
      account: "demo" as const,
      mapped: [mapped("A", 50), mapped("B", 50, "unavailable")],
    };

    const spread = await buildCopyPlan({ ...base });
    expect(spread.legs[0]?.usd).toBe(100);
    expect(spread.unavailableUsd).toBe(0);

    const notSpread = await buildCopyPlan({ ...base, spreadUnavailable: false });
    expect(notSpread.legs[0]?.usd).toBe(50);
    expect(notSpread.unavailableUsd).toBe(50);
    expect(notSpread.warnings.join(" ")).toMatch(/USDC/);
  });

  it("una familia sólo para mirar no arma piernas", async () => {
    const plan = await buildCopyPlan({
      portfolio: portfolioOf("broker_cl"),
      totalUsd: 200,
      account: "demo",
      mapped: [mapped("A", 100)],
    });
    expect(plan.legs).toEqual([]);
    expect(plan.coveragePct).toBe(0);
    expect(plan.unavailableUsd).toBe(200);
    expect(plan.warnings.join(" ")).toMatch(/sólo para mirar/i);
  });

  it("si el monto no alcanza ni para una pierna de US$1, no hay piernas", async () => {
    const plan = await buildCopyPlan({
      portfolio: portfolioOf(),
      totalUsd: 0.5,
      account: "demo",
      mapped: [mapped("A", 100)],
    });
    expect(plan.legs).toEqual([]);
    expect(sumLegCents(plan.legs)).toBe(0);
  });
});

describe("coverageOf: peso declarado que sí se compra", () => {
  it("sólo cuenta las posiciones disponibles", () => {
    expect(
      coverageOf([
        { status: "available", weightOriginal: 50 },
        { status: "review", weightOriginal: 20 },
        { status: "unavailable", weightOriginal: 30 },
      ]),
    ).toBe(50);
  });

  it("en top50 mide contra lo declarado, no contra 100", () => {
    expect(
      coverageOf([
        { status: "available", weightOriginal: 25 },
        { status: "unavailable", weightOriginal: 25 },
      ]),
    ).toBe(50);
  });

  it("sin pesos declarados es 0", () => {
    expect(coverageOf([])).toBe(0);
  });
});

describe("plan-token: HMAC, usuario y TTL de 10 minutos", () => {
  const payload = {
    slug: SLUG,
    versionId: VERSION_ID,
    account: "demo" as const,
    totalUsd: 100,
    spreadUnavailable: true,
    coveragePct: 100,
    maxLegs: COPY_MAX_LEGS_DEMO,
    legs: [{ symbol: "AAPLx", usd: 100, weightOriginal: 100, weightMaverlang: 100 }],
    warnings: [],
  };

  it("firma y verifica para el mismo usuario", () => {
    const token = signPlan(payload, "user-1", { now: NOW });
    expect(typeof token).toBe("string");
    const verified = verifyPlan(token, "user-1", { now: NOW + 1_000 });
    expect(verified).not.toBeNull();
    expect(verified?.slug).toBe(SLUG);
    expect(verified?.sub).toBe("user-1");
    expect(verified?.exp).toBe(NOW + COPY_PLAN_TTL_MS);
  });

  it("otro usuario no puede reutilizar el plan", () => {
    const token = signPlan(payload, "user-1", { now: NOW });
    expect(verifyPlan(token, "user-2", { now: NOW + 1_000 })).toBeNull();
    expect(verifyPlanDetailed(token, "user-2", { now: NOW + 1_000 })).toEqual({
      ok: false,
      reason: "user",
    });
  });

  it("vence a los 10 minutos", () => {
    const token = signPlan(payload, "user-1", { now: NOW });
    expect(verifyPlan(token, "user-1", { now: NOW + COPY_PLAN_TTL_MS - 1 })).not.toBeNull();
    expect(verifyPlan(token, "user-1", { now: NOW + COPY_PLAN_TTL_MS })).toBeNull();
    expect(verifyPlanDetailed(token, "user-1", { now: NOW + COPY_PLAN_TTL_MS })).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("un token adulterado no vale", () => {
    const token = signPlan(payload, "user-1", { now: NOW });
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    expect(verifyPlan(tampered, "user-1", { now: NOW + 1_000 })).toBeNull();
    expect(verifyPlanDetailed(tampered, "user-1", { now: NOW + 1_000 })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("no firma un plan sin piernas", () => {
    expect(() =>
      signPlan({ ...payload, legs: [] }, "user-1", { now: NOW }),
    ).toThrow();
  });
});
