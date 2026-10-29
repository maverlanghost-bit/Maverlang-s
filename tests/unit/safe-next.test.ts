import { describe, expect, it } from "vitest";

import { decideGate, type GateInput } from "@/lib/auth/gate";
import { safeNextPath } from "@/lib/auth/paths";

describe("safeNextPath", () => {
  it("conserva una ruta interna de la app", () => {
    expect(safeNextPath("/app")).toBe("/app");
    expect(safeNextPath("/app/cartera")).toBe("/app/cartera");
    expect(safeNextPath("/app/accion/AAPLx?operar=vender")).toBe("/app/accion/AAPLx?operar=vender");
    expect(safeNextPath("/app/billetera?x=1")).toBe("/app/billetera?x=1");
  });

  it("rechaza lo que sale de la app", () => {
    expect(safeNextPath("https://evil.test/app")).toBeNull();
    expect(safeNextPath("//evil.test")).toBeNull();
    expect(safeNextPath("/\\evil")).toBeNull();
    expect(safeNextPath("/ayuda")).toBeNull();
    expect(safeNextPath("/app/../secrets")).toBeNull();
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });

  it("no usa ingreso, registro ni onboarding como destino", () => {
    expect(safeNextPath("/app/ingresar")).toBeNull();
    expect(safeNextPath("/app/ingresar/verificar")).toBeNull();
    expect(safeNextPath("/app/registro")).toBeNull();
    expect(safeNextPath("/app/onboarding")).toBeNull();
    expect(safeNextPath("/app/onboarding/paso")).toBeNull();
  });

  it("desanida next, redirect y returnTo hasta una ruta real", () => {
    expect(safeNextPath("/app/onboarding?next=/app/cartera")).toBe("/app/cartera");
    expect(safeNextPath("/app/ingresar?redirect=/app/billetera")).toBe("/app/billetera");
    expect(safeNextPath("/app/registro?returnTo=/app/perfil")).toBe("/app/perfil");
    expect(safeNextPath("/app/ingresar?next=/app/onboarding?next=/app/accion/AAPLx")).toBe("/app/accion/AAPLx");
    expect(safeNextPath("/app/ingresar?next=" + encodeURIComponent("/app/onboarding?next=/app/cartera"))).toBe(
      "/app/cartera",
    );
  });

  it("corta un anidado que solo apunta a ingreso y onboarding", () => {
    const nested = "/app/ingresar?next=/app/onboarding?next=/app/ingresar?next=/app/onboarding";
    expect(safeNextPath(nested)).toBeNull();
    expect(safeNextPath("/app/onboarding?next=/app/ingresar")).toBeNull();
    expect(safeNextPath("/app/onboarding?next=https://evil.test/app")).toBeNull();
  });

  it("saca un next inválido de una ruta que sí vale", () => {
    expect(safeNextPath("/app/cartera?next=/app/ingresar")).toBe("/app/cartera");
    expect(safeNextPath("/app/cartera?next=https://evil.test")).toBe("/app/cartera");
    expect(safeNextPath("/app/accion/AAPLx?operar=comprar&next=/app/onboarding")).toBe(
      "/app/accion/AAPLx?operar=comprar",
    );
    expect(safeNextPath("/app/cartera?next=/app/onboarding?next=/app/perfil")).toBe("/app/cartera?next=%2Fapp%2Fperfil");
  });
});

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

describe("el gate no anida ingreso y onboarding", () => {
  it("sin sesión, onboarding vuelve al ingreso con un next interno y stay", () => {
    expect(decideGate({ ...base, pathname: "/app/onboarding" })).toEqual({
      kind: "redirect",
      pathname: "/app/ingresar",
      search: "?next=%2Fapp&stay=1",
    });
    expect(
      decideGate({
        ...base,
        pathname: "/app/onboarding",
        search: "?next=" + encodeURIComponent("/app/ingresar?next=/app/onboarding?next=/app/cartera"),
      }),
    ).toEqual({
      kind: "redirect",
      pathname: "/app/ingresar",
      search: "?next=%2Fapp%2Fcartera&stay=1",
    });
  });

  it("con sesión y sin registro, el next anidado queda en la ruta real", () => {
    expect(
      decideGate({
        ...base,
        mockSession: "1",
        pathname: "/app/ingresar",
        search: "?next=" + encodeURIComponent("/app/onboarding?next=/app/cartera") + "&stay=1",
      }),
    ).toEqual({
      kind: "redirect",
      pathname: "/app/onboarding",
      search: "?next=%2Fapp%2Fcartera",
    });
  });
});
