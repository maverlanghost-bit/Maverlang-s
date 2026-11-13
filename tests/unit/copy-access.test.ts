import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Paywall de «Copiar carteras» (§1.10) y los tres flags (§1.1).
 *
 * Sin red: el cliente de Supabase se reemplaza por uno que falla, igual que
 * un deploy sin base configurada. Así el paywall debe fallar CERRADO.
 */

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    throw new Error("sin base en tests");
  },
}));

import {
  CopyAccessError,
  copyAccessResponseOf,
  entitlementFromSubscription,
  getCopyEntitlement,
  hasCopyAccess,
  invalidateCopyEntitlement,
  isCopyReadOnly,
  redactPortfolio,
  requireCopyAccess,
} from "@/lib/copy/access";
import { isCopyBillingEnabled, isCopyDevMode, isCopyEnabled, isCopyRealBuyEnabled } from "@/lib/copy/flags";
import type { CopyFamily, CopyPortfolio } from "@/lib/copy/types";
import { __resetFlagsForTests, __setFlagReaderForTests, safeFlagDefault } from "@/lib/flags";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const NOW = Date.parse("2026-11-10T12:00:00.000Z");
const DAY = 86_400_000;
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const ENV_KEYS = [
  "COPY_DEV_ENTITLEMENT",
  "COPY_REAL_BUY_READY",
  "COPY_BILLING_READY",
  "MERCADOPAGO_ACCESS_TOKEN",
  "MERCADOPAGO_WEBHOOK_SECRET",
] as const;
const savedEnv = new Map<string, string | undefined>();

function portfolioOf(family: CopyFamily): CopyPortfolio {
  return {
    versionId: "v1:" + "a".repeat(64),
    generatedAt: iso(-2 * 3600_000),
    portfolio: {
      slug: family === "broker_cl" ? "bice-acciones-destacadas" : "berkshire-hathaway-13f",
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
        weight: 60,
        previousWeight: 58,
        side: "long",
        currency: "USD",
        asOf: "2026-09-30",
      },
      {
        symbol: "KO",
        name: "Coca-Cola",
        weight: 40,
        previousWeight: null,
        side: "long",
        currency: "USD",
        asOf: "2026-09-30",
      },
    ],
    movements: [
      {
        type: "weight_change",
        symbol: "AAPL",
        txDate: null,
        publishedAt: "2026-11-01",
        lagDays: 32,
        weightFrom: 58,
        weightTo: 60,
        sourceUrl: null,
        verification: "official_filing",
      },
    ],
    disclaimer: "Dato de ejemplo, no es recomendación.",
    example: true,
  };
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    if (!savedEnv.has(key)) savedEnv.set(key, process.env[key]);
    delete process.env[key];
  }
  __setFlagReaderForTests(null);
  __resetFlagsForTests();
  invalidateCopyEntitlement();
});

afterEach(() => {
  __setFlagReaderForTests(null);
  __resetFlagsForTests();
  invalidateCopyEntitlement();
});

afterAll(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("flags: los tres nacen apagados", () => {
  it("safeFlagDefault devuelve false para los flags de Copiar", () => {
    expect(safeFlagDefault("copy_enabled")).toBe(false);
    expect(safeFlagDefault("copy_buy_enabled")).toBe(false);
    expect(safeFlagDefault("copy_billing_enabled")).toBe(false);
  });

  it("con los flags apagados, copiar con dinero real y cobro están cerrados", async () => {
    __setFlagReaderForTests(async () => undefined);
    expect(await isCopyRealBuyEnabled()).toBe(false);
    expect(await isCopyBillingEnabled()).toBe(false);
  });

  it("en desarrollo la sección se puede probar sin el flag global (excepción §1.1)", async () => {
    __setFlagReaderForTests(async () => undefined);
    expect(await isCopyEnabled()).toBe(isCopyDevMode());
  });

  it("en producción, sin fila en app_flags, la sección queda apagada", async () => {
    __setFlagReaderForTests(async () => undefined);
    const previous = process.env.NODE_ENV;
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = "production";
    try {
      expect(await isCopyEnabled()).toBe(false);
      expect(await isCopyRealBuyEnabled()).toBe(false);
      expect(await isCopyBillingEnabled()).toBe(false);
    } finally {
      env.NODE_ENV = previous;
    }
  });

  it("con flags encendidos, sin COPY_REAL_BUY_READY ni COPY_BILLING_READY nada se abre", async () => {
    __setFlagReaderForTests(async () => true);
    expect(await isCopyRealBuyEnabled()).toBe(false);
    expect(await isCopyBillingEnabled()).toBe(false);
  });
});

describe("entitlementFromSubscription", () => {
  it("sin fila no hay acceso", () => {
    expect(entitlementFromSubscription(null, NOW)).toBe("none");
  });

  it("active da acceso; pending no", () => {
    expect(entitlementFromSubscription({ status: "active", provider: "mercadopago" }, NOW)).toBe(
      "active",
    );
    expect(entitlementFromSubscription({ status: "pending", provider: "mercadopago" }, NOW)).toBe(
      "none",
    );
  });

  it("trial solo mientras trial_ends_at siga vigente", () => {
    expect(
      entitlementFromSubscription({ status: "trial", trial_ends_at: iso(DAY) }, NOW),
    ).toBe("trial");
    expect(
      entitlementFromSubscription({ status: "trial", trial_ends_at: iso(-1) }, NOW),
    ).toBe("none");
    expect(entitlementFromSubscription({ status: "trial", trial_ends_at: null }, NOW)).toBe("none");
  });

  it("past_due tiene 3 días de gracia y después se cierra", () => {
    expect(
      entitlementFromSubscription(
        { status: "past_due", current_period_end: iso(-DAY) },
        NOW,
      ),
    ).toBe("past_due");
    expect(
      entitlementFromSubscription(
        { status: "past_due", current_period_end: iso(-4 * DAY) },
        NOW,
      ),
    ).toBe("none");
  });

  it("canceled mantiene acceso hasta current_period_end", () => {
    expect(
      entitlementFromSubscription(
        { status: "canceled", current_period_end: iso(DAY) },
        NOW,
      ),
    ).toBe("canceled");
    expect(
      entitlementFromSubscription(
        { status: "canceled", current_period_end: iso(-DAY) },
        NOW,
      ),
    ).toBe("none");
  });

  it("Fraccion Pro vale hasta su exp (current_period_end)", () => {
    expect(
      entitlementFromSubscription(
        { status: "active", provider: "fraccion_pro", current_period_end: iso(5 * DAY) },
        NOW,
      ),
    ).toBe("fraccion_pro");
    expect(
      entitlementFromSubscription(
        { status: "active", provider: "fraccion_pro", current_period_end: iso(-DAY) },
        NOW,
      ),
    ).toBe("none");
  });
});

describe("hasCopyAccess e isCopyReadOnly", () => {
  it("todos los estados con acceso, menos none", () => {
    expect(hasCopyAccess("none")).toBe(false);
    expect(hasCopyAccess("trial")).toBe(true);
    expect(hasCopyAccess("active")).toBe(true);
    expect(hasCopyAccess("past_due")).toBe(true);
    expect(hasCopyAccess("canceled")).toBe(true);
    expect(hasCopyAccess("fraccion_pro")).toBe(true);
  });

  it("past_due es solo lectura", () => {
    expect(isCopyReadOnly("past_due")).toBe(true);
    expect(isCopyReadOnly("active")).toBe(false);
    expect(isCopyReadOnly("trial")).toBe(false);
  });
});

describe("redactPortfolio: sin acceso no viaja la composición", () => {
  it("13F sin acceso: 0 posiciones y 0 movimientos, metadatos intactos", () => {
    const full = portfolioOf("13f");
    const redacted = redactPortfolio(full, false);
    expect(redacted.positions).toEqual([]);
    expect(redacted.movements).toEqual([]);
    expect(redacted.portfolio.slug).toBe(full.portfolio.slug);
    expect(redacted.portfolio.asOf).toBe(full.portfolio.asOf);
    expect(redacted.portfolio.lagDays).toBe(full.portfolio.lagDays);
    expect(redacted.example).toBe(true);
  });

  it("broker_cl es la excepción: se ve completa sin acceso", () => {
    const full = portfolioOf("broker_cl");
    const redacted = redactPortfolio(full, false);
    expect(redacted.positions).toHaveLength(full.positions.length);
    expect(redacted.movements).toHaveLength(full.movements.length);
  });

  it("con acceso se devuelve todo y nunca se muta el original", () => {
    const full = portfolioOf("13f");
    const before = JSON.stringify(full);
    expect(redactPortfolio(full, true).positions).toHaveLength(full.positions.length);
    redactPortfolio(full, false);
    expect(JSON.stringify(full)).toBe(before);
  });
});

describe("requireCopyAccess: 402 COPY_SUBSCRIPTION_REQUIRED", () => {
  it("sin base ni suscripción falla cerrado con 402", async () => {
    expect(await getCopyEntitlement(USER_ID, NOW)).toBe("none");

    let caught: unknown = null;
    try {
      await requireCopyAccess(USER_ID);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CopyAccessError);
    const accessError = caught as CopyAccessError;
    expect(accessError.status).toBe(402);
    expect(accessError.copyCode).toBe("COPY_SUBSCRIPTION_REQUIRED");

    const response = copyAccessResponseOf(caught);
    expect(response?.status).toBe(402);
    const body = (await response!.json()) as { ok?: boolean; error?: { code?: string } };
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("COPY_SUBSCRIPTION_REQUIRED");
  });

  it("un error cualquiera no se convierte en 402", () => {
    expect(copyAccessResponseOf(new Error("otra cosa"))).toBeNull();
  });
});
