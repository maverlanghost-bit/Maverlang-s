import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { decideGate, type GateInput } from "@/lib/auth/gate";
import { isPublicAppPath } from "@/lib/auth/paths";
import {
  resolveDisplayCurrency,
  serializeCurrencyCookie,
} from "@/lib/preferences/currency";
import { notionalUsd } from "@/lib/trade/amount";

const base: GateInput = {
  pathname: "/app",
  search: "",
  countryHeader: "CL",
  countryQuery: null,
  nodeEnv: "test",
  blockedCountries: ["US"],
  mockSession: null,
  onboarding: null,
  privyToken: null,
  usePrivy: false,
  useSupabase: false,
  supabaseSession: false,
  supabaseOnboarded: false,
};

describe("M40: resolveDisplayCurrency (sesión > local > default)", () => {
  it("la sesión manda sobre local", () => {
    expect(resolveDisplayCurrency({ prefs: "USD", stored: "CLP" })).toBe("USD");
    expect(resolveDisplayCurrency({ prefs: "CLP", stored: "USD" })).toBe("CLP");
  });
  it("sin sesión usa local y sin nada usa CLP", () => {
    expect(resolveDisplayCurrency({ prefs: null, stored: "USD" })).toBe("USD");
    expect(resolveDisplayCurrency({ prefs: null, stored: "CLP" })).toBe("CLP");
    expect(resolveDisplayCurrency({ prefs: null, stored: null })).toBe("CLP");
    expect(resolveDisplayCurrency({})).toBe("CLP");
    expect(resolveDisplayCurrency({ prefs: null, stored: "EUR" })).toBe("CLP");
  });
  it("la cookie mv_currency dura un año y es Lax", () => {
    expect(serializeCurrencyCookie("CLP")).toBe("mv_currency=CLP; path=/; max-age=31536000; SameSite=Lax");
    expect(serializeCurrencyCookie("USD")).toBe("mv_currency=USD; path=/; max-age=31536000; SameSite=Lax");
  });
});

describe("M40: conversión CLP->USD del monto de la orden", () => {
  it("el nocional en CLP se divide por el tipo de cambio", () => {
    expect(notionalUsd(9800, "CLP", 980, 100)).toBeCloseTo(10, 9);
    expect(notionalUsd(10, "USDC", 980, 100)).toBe(10);
  });
  it("sin tipo de cambio no hay nocional en CLP", () => {
    expect(notionalUsd(9800, "CLP", null, 100)).toBeNull();
  });
});

describe("M40: /app/ajustes es pública en el gate", () => {
  it("isPublicAppPath deja pasar ajustes y sigue pidiendo sesión en cartera", () => {
    expect(isPublicAppPath("/app/ajustes")).toBe(true);
    expect(isPublicAppPath("/app/ajustes/")).toBe(true);
    expect(isPublicAppPath("/app/cartera")).toBe(false);
    expect(isPublicAppPath("/app/perfil")).toBe(false);
  });
  it("decideGate deja ver ajustes sin sesión y con pendiente de onboarding", () => {
    expect(decideGate({ ...base, pathname: "/app/ajustes" })).toEqual({ kind: "next" });
    expect(decideGate({ ...base, pathname: "/app/ajustes", mockSession: "1", onboarding: null })).toEqual({
      kind: "next",
    });
  });
});

describe("M40: /app/perfil/idioma redirige a /app/ajustes", () => {
  it("page.tsx redirige a /app/ajustes", () => {
    const file = path.resolve(__dirname, "..", "..", "app/(platform)/app/perfil/idioma/page.tsx");
    const source = readFileSync(file, "utf8");
    expect(source).toContain('redirect("/app/ajustes")');
  });
});

describe("M40: sin montos fijos en la moneda única", () => {
  const files = [
    "app/(platform)/app/accion/[ticker]/detail-screen.tsx",
    "components/domain/trade-sheet.tsx",
    "app/(platform)/app/cartera/portfolio-screen.tsx",
  ];
  for (const relative of files) {
    it(`${relative} no usa formatUsd( ni formatClp(`, () => {
      const file = path.resolve(__dirname, "..", "..", relative);
      const source = readFileSync(file, "utf8");
      expect(source, `${relative} usa formatUsd(`).not.toContain("formatUsd(");
      expect(source, `${relative} usa formatClp(`).not.toContain("formatClp(");
    });
  }
});
