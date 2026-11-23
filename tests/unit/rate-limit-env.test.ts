import { afterEach, describe, expect, it } from "vitest";

import { RATE_LIMIT_POLICIES, rateLimitEnvKey, resolvePolicy } from "@/lib/security/rate-limit";

/** T93: los topes se ajustan con `RATE_LIMIT_<POLÍTICA>` sin desplegar código. */
describe("T93: tope de rate limit por variable de entorno", () => {
  afterEach(() => {
    delete process.env.RATE_LIMIT_PRICES;
    delete process.env.RATE_LIMIT_AI_GLOBAL_DAILY;
  });

  it("arma la clave en mayúsculas con guion bajo", () => {
    expect(rateLimitEnvKey("prices")).toBe("RATE_LIMIT_PRICES");
    expect(rateLimitEnvKey("aiGlobalDaily")).toBe("RATE_LIMIT_AI_GLOBAL_DAILY");
    expect(rateLimitEnvKey("publicGet")).toBe("RATE_LIMIT_PUBLIC_GET");
  });

  it("sin variable rige el valor del código", () => {
    expect(resolvePolicy("prices")).toEqual(RATE_LIMIT_POLICIES.prices);
  });

  it("la variable reemplaza el tope y conserva la ventana", () => {
    process.env.RATE_LIMIT_AI_GLOBAL_DAILY = "20000";
    expect(resolvePolicy("aiGlobalDaily")).toEqual({ limit: 20_000, windowMs: RATE_LIMIT_POLICIES.aiGlobalDaily.windowMs });
  });

  it("ignora valores inválidos", () => {
    for (const value of ["0", "-5", "abc", "1.5", "2000000"]) {
      process.env.RATE_LIMIT_PRICES = value;
      expect(resolvePolicy("prices").limit, value).toBe(RATE_LIMIT_POLICIES.prices.limit);
    }
  });
});
