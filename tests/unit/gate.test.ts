import { describe, expect, it } from "vitest";

import { decideGate, type GateInput } from "@/lib/auth/gate";
import { isPublicAppPath } from "@/lib/auth/paths";

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

function gate(overrides: Partial<GateInput> = {}) {
  return decideGate({ ...base, ...overrides });
}

function login(next: string) {
  const params = new URLSearchParams();
  params.set("next", next);
  return { kind: "redirect" as const, pathname: "/app/ingresar", search: `?${params.toString()}` };
}

function onboarding(next: string) {
  const params = new URLSearchParams();
  params.set("next", next);
  return { kind: "redirect" as const, pathname: "/app/onboarding", search: `?${params.toString()}` };
}

const NEXT = { kind: "next" as const };
const SESSION = { mockSession: "1", onboarding: "1" };

describe("isPublicAppPath", () => {
  it("deja público el mercado y el detalle", () => {
    expect(isPublicAppPath("/app")).toBe(true);
    expect(isPublicAppPath("/app/accion")).toBe(true);
    expect(isPublicAppPath("/app/accion/AAPLx")).toBe(true);
    expect(isPublicAppPath("/app/cartera")).toBe(false);
    expect(isPublicAppPath("/app/billetera/enviar")).toBe(false);
    expect(isPublicAppPath("/app/perfil/cuenta")).toBe(false);
    expect(isPublicAppPath("/app/ingresar")).toBe(false);
    expect(isPublicAppPath("/app/registro")).toBe(false);
    expect(isPublicAppPath("/app/onboarding")).toBe(false);
    expect(isPublicAppPath("/app/acciones")).toBe(false);
  });
});

describe("decideGate", () => {
  it("deja pasar el mercado y el detalle sin sesión", () => {
    expect(gate()).toEqual(NEXT);
    expect(gate({ pathname: "/app/accion/AAPLx", search: "?operar=vender" })).toEqual(NEXT);
  });

  it("manda a ingresar cartera, billetera y perfil, con next", () => {
    expect(gate({ pathname: "/app/cartera" })).toEqual(login("/app/cartera"));
    expect(gate({ pathname: "/app/billetera", search: "?x=1" })).toEqual(login("/app/billetera?x=1"));
    expect(gate({ pathname: "/app/billetera/depositar" })).toEqual(login("/app/billetera/depositar"));
    expect(gate({ pathname: "/app/billetera/enviar" })).toEqual(login("/app/billetera/enviar"));
    expect(gate({ pathname: "/app/billetera/recibir" })).toEqual(login("/app/billetera/recibir"));
    expect(gate({ pathname: "/app/perfil" })).toEqual(login("/app/perfil"));
    expect(gate({ pathname: "/app/perfil/cuenta" })).toEqual(login("/app/perfil/cuenta"));
    expect(gate({ pathname: "/app/onboarding" })).toEqual(login("/app/onboarding"));
  });

  it("con sesión y registro completo se comporta como antes", () => {
    expect(gate({ ...SESSION, pathname: "/app" })).toEqual(NEXT);
    expect(gate({ ...SESSION, pathname: "/app/cartera" })).toEqual(NEXT);
    expect(gate({ ...SESSION, pathname: "/app/billetera/enviar" })).toEqual(NEXT);
    expect(gate({ ...SESSION, pathname: "/app/perfil/idioma" })).toEqual(NEXT);
    expect(gate({ ...SESSION, pathname: "/app/ingresar" })).toEqual({
      kind: "redirect",
      pathname: "/app",
      search: "",
    });
    expect(
      gate({
        ...SESSION,
        pathname: "/app/ingresar",
        search: "?next=%2Fapp%2Faccion%2FAAPLx%3Foperar%3Dvender",
      }),
    ).toEqual({ kind: "redirect", pathname: "/app/accion/AAPLx", search: "?operar=vender" });
  });

  it("con sesión y sin registro deja ver lo público y manda el resto al onboarding", () => {
    const pending = { mockSession: "1", onboarding: null };
    expect(gate({ ...pending, pathname: "/app" })).toEqual(NEXT);
    expect(gate({ ...pending, pathname: "/app/accion/AAPLx", search: "?operar=comprar" })).toEqual(NEXT);
    expect(gate({ ...pending, pathname: "/app/cartera" })).toEqual(onboarding("/app/cartera"));
    expect(gate({ ...pending, pathname: "/app/billetera" })).toEqual(onboarding("/app/billetera"));
    expect(gate({ ...pending, pathname: "/app/perfil/ajustes" })).toEqual(onboarding("/app/perfil/ajustes"));
    expect(gate({ ...pending, pathname: "/app/onboarding" })).toEqual(NEXT);
    expect(gate({ ...pending, pathname: "/app/ingresar" })).toEqual({
      kind: "redirect",
      pathname: "/app/onboarding",
      search: "",
    });
  });

  it("sigue geobloqueando el mercado público", () => {
    expect(gate({ countryHeader: "US", pathname: "/app" })).toEqual({
      kind: "redirect",
      pathname: "/bloqueado",
      search: "",
    });
    expect(gate({ countryHeader: "US", pathname: "/app/accion/AAPLx", ...SESSION })).toEqual({
      kind: "redirect",
      pathname: "/bloqueado",
      search: "",
    });
  });

  it("con Privy no acepta la cookie mock como sesión", () => {
    expect(gate({ usePrivy: true, mockSession: "1", onboarding: "1", pathname: "/app/cartera" })).toEqual(
      login("/app/cartera"),
    );
    expect(gate({ usePrivy: true, privyToken: "tok", onboarding: "1", pathname: "/app/cartera" })).toEqual(NEXT);
  });

  it("con Supabase usa la sesión verificada y no la cookie mock", () => {
    expect(
      gate({
        useSupabase: true,
        supabaseSession: false,
        mockSession: "1",
        onboarding: "1",
        pathname: "/app/cartera",
      }),
    ).toEqual(login("/app/cartera"));
    expect(
      gate({
        useSupabase: true,
        supabaseSession: true,
        onboarding: "1",
        supabaseOnboarded: false,
        pathname: "/app/cartera",
      }),
    ).toEqual(onboarding("/app/cartera"));
    expect(
      gate({
        useSupabase: true,
        supabaseSession: true,
        onboarding: null,
        supabaseOnboarded: true,
        pathname: "/app/cartera",
      }),
    ).toEqual(NEXT);
    expect(gate({ useSupabase: true, supabaseSession: true, onboarding: null, pathname: "/app" })).toEqual(NEXT);
    expect(
      gate({ useSupabase: true, supabaseSession: true, onboarding: null, pathname: "/app/cartera" }),
    ).toEqual(onboarding("/app/cartera"));
    expect(
      gate({
        useSupabase: true,
        usePrivy: true,
        privyToken: "tok",
        supabaseSession: false,
        pathname: "/app/perfil",
      }),
    ).toEqual(login("/app/perfil"));
  });

  it("deja el registro público y, con sesión, lo trata según el JWT", () => {
    expect(gate({ pathname: "/app/registro", search: "?next=%2Fapp%2Faccion%2FAAPLx" })).toEqual(NEXT);
    expect(
      gate({
        useSupabase: true,
        supabaseSession: true,
        supabaseOnboarded: false,
        pathname: "/app/registro",
        search: "?next=%2Fapp%2Faccion%2FAAPLx",
      }),
    ).toEqual(onboarding("/app/accion/AAPLx"));
    expect(
      gate({
        useSupabase: true,
        supabaseSession: true,
        supabaseOnboarded: true,
        pathname: "/app/registro",
        search: "?next=%2Fapp%2Faccion%2FAAPLx",
      }),
    ).toEqual({ kind: "redirect", pathname: "/app/accion/AAPLx", search: "" });
  });

  it("no bloquea /auth aunque no haya sesión o el país esté bloqueado", () => {
    expect(gate({ pathname: "/auth/callback", search: "?code=1", countryHeader: "US" })).toEqual(NEXT);
    expect(gate({ pathname: "/auth/callback", useSupabase: true, supabaseSession: false })).toEqual(NEXT);
  });
});
