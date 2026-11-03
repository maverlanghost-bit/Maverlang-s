import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decideGate, hasAuthSession, type GateInput } from "@/lib/auth/gate";
import {
  assertMockAuthAllowed,
  authMode,
  isMockAuthAllowed,
  isProductionAuthRuntime,
  resetAuthModeWarningsForTests,
} from "@/lib/auth/mode";
import { mockSessionFromCookie } from "@/lib/services/auth.mock";

/**
 * Auditoría A-01 / A1-01: la autenticación falla cerrado en producción.
 * Un typo en AUTH_MODE, una clave faltante o un despliegue sin Supabase no
 * pueden degradar en silencio a la demo (cookie `a24_mock_session`).
 */

const SUPABASE_URL = "https://example.supabase.co";
const SUPABASE_KEY = "publishable-test";
const originalAllowMock = process.env.ALLOW_MOCK_AUTH;

beforeEach(() => {
  // El entorno del operador no debe cambiar el resultado de estos tests.
  delete process.env.ALLOW_MOCK_AUTH;
  resetAuthModeWarningsForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetAuthModeWarningsForTests();
});

afterAll(() => {
  if (originalAllowMock === undefined) delete process.env.ALLOW_MOCK_AUTH;
  else process.env.ALLOW_MOCK_AUTH = originalAllowMock;
});

describe("authMode: producción falla cerrado", () => {
  it("AUTH_MODE=supabase sin URL lanza", () => {
    expect(() =>
      authMode({ flag: "supabase", publishableKey: SUPABASE_KEY, nodeEnv: "production" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("AUTH_MODE=supabase sin clave lanza", () => {
    expect(() => authMode({ flag: "supabase", supabaseUrl: SUPABASE_URL, nodeEnv: "production" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it("AUTH_MODE=supabase con URL inválida lanza", () => {
    expect(() =>
      authMode({ flag: "supabase", supabaseUrl: "no-es-url", publishableKey: SUPABASE_KEY, nodeEnv: "production" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("un supabase incompleto lanza aunque ALLOW_MOCK_AUTH=true: se pidió Supabase", () => {
    expect(() =>
      authMode({
        flag: "supabase",
        supabaseUrl: SUPABASE_URL,
        nodeEnv: "production",
        allowMockAuth: true,
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("modo mock lanza sin ALLOW_MOCK_AUTH", () => {
    expect(() => authMode({ flag: "mock", nodeEnv: "production" })).toThrow(/ALLOW_MOCK_AUTH/);
  });

  it("flag ausente no cae a mock en silencio: lanza", () => {
    expect(() => authMode({ nodeEnv: "production" })).toThrow(/ALLOW_MOCK_AUTH/);
    expect(() => authMode({ flag: "  ", nodeEnv: "production" })).toThrow(/ALLOW_MOCK_AUTH/);
  });

  it("VERCEL_ENV=production también cuenta como producción", () => {
    expect(() => authMode({ flag: "mock", nodeEnv: "development", vercelEnv: "production" })).toThrow(
      /ALLOW_MOCK_AUTH/,
    );
    expect(() =>
      authMode({ flag: "supabase", supabaseUrl: SUPABASE_URL, vercelEnv: "production" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("APP_ENV=production también cuenta como producción", () => {
    expect(() => authMode({ flag: "mock", nodeEnv: "test", appEnv: "production" })).toThrow(/ALLOW_MOCK_AUTH/);
  });

  it("producción + mock + ALLOW_MOCK_AUTH=true acepta la demo explícita", () => {
    expect(authMode({ flag: "mock", nodeEnv: "production", allowMockAuth: true })).toBe("mock");
    expect(authMode({ nodeEnv: "production", allowMockAuth: true })).toBe("mock");
  });

  it("producción + supabase completo sigue en supabase", () => {
    expect(
      authMode({
        flag: "supabase",
        supabaseUrl: SUPABASE_URL,
        publishableKey: SUPABASE_KEY,
        nodeEnv: "production",
      }),
    ).toBe("supabase");
  });
});

describe("authMode: flag inválido", () => {
  it("un typo lanza en producción (con o sin ALLOW_MOCK_AUTH)", () => {
    expect(() => authMode({ flag: "supabse", nodeEnv: "production" })).toThrow(/AUTH_MODE/);
    expect(() => authMode({ flag: "live", nodeEnv: "production", allowMockAuth: true })).toThrow(/AUTH_MODE/);
  });

  it("fuera de producción avisa una vez y sigue en mock", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(authMode({ flag: "supabse", nodeEnv: "development" })).toBe("mock");
    expect(authMode({ flag: "supabse", nodeEnv: "development" })).toBe("mock");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("authMode: desarrollo y test siguen en demo", () => {
  it("mock funciona sin ALLOW_MOCK_AUTH", () => {
    expect(authMode({ flag: "mock", nodeEnv: "development" })).toBe("mock");
    expect(authMode({ flag: "mock", nodeEnv: "test" })).toBe("mock");
    expect(authMode({ nodeEnv: "test" })).toBe("mock");
  });

  it("supabase incompleto sigue cayendo a mock fuera de producción", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(authMode({ flag: "supabase", nodeEnv: "development" })).toBe("mock");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("isMockAuthAllowed / assertMockAuthAllowed", () => {
  it("lee las señales del entorno cuando no se pasan", () => {
    // vitest corre con NODE_ENV=test: fuera de producción.
    expect(isProductionAuthRuntime()).toBe(false);
    expect(isMockAuthAllowed()).toBe(true);
  });

  it("fuera de producción siempre se permite", () => {
    expect(isMockAuthAllowed({ nodeEnv: "test" })).toBe(true);
    expect(isMockAuthAllowed({ nodeEnv: "development" })).toBe(true);
    expect(() => assertMockAuthAllowed("test")).not.toThrow();
  });

  it("en producción exige ALLOW_MOCK_AUTH=true explícito", () => {
    expect(isMockAuthAllowed({ nodeEnv: "production" })).toBe(false);
    expect(isMockAuthAllowed({ vercelEnv: "production" })).toBe(false);
    expect(isMockAuthAllowed({ nodeEnv: "production", allowMockAuth: false })).toBe(false);
    expect(isMockAuthAllowed({ nodeEnv: "production", allowMockAuth: true })).toBe(true);
    expect(() => assertMockAuthAllowed("test")).not.toThrow(); // NODE_ENV=test en vitest
  });
});

describe("gate: la cookie mock no autentica en producción", () => {
  const base: GateInput = {
    pathname: "/app/cartera",
    search: "",
    countryHeader: "CL",
    countryQuery: null,
    nodeEnv: "production",
    blockedCountries: ["US"],
    mockSession: "cualquier-valor",
    onboarding: "1",
    privyToken: null,
    usePrivy: false,
    useSupabase: false,
    supabaseSession: false,
    supabaseOnboarded: false,
    supabaseMfaRequired: false,
  };

  it("hasAuthSession ignora la cookie mock en producción", () => {
    expect(
      hasAuthSession({
        useSupabase: false,
        supabaseSession: false,
        usePrivy: false,
        privyToken: null,
        mockSession: "cualquier-valor",
        nodeEnv: "production",
      }),
    ).toBe(false);
    expect(decideGate(base)).toEqual({
      kind: "redirect",
      pathname: "/app/ingresar",
      search: "?next=%2Fapp%2Fcartera",
    });
  });

  it("con ALLOW_MOCK_AUTH=true la demo vuelve a entrar", () => {
    expect(
      hasAuthSession({
        useSupabase: false,
        supabaseSession: false,
        usePrivy: false,
        privyToken: null,
        mockSession: "cualquier-valor",
        nodeEnv: "production",
        allowMockAuth: true,
      }),
    ).toBe(true);
    expect(decideGate({ ...base, allowMockAuth: true })).toEqual({ kind: "next" });
  });

  it("fuera de producción la cookie mock sigue autenticando", () => {
    expect(decideGate({ ...base, nodeEnv: "test" })).toEqual({ kind: "next" });
    expect(decideGate({ ...base, nodeEnv: "development" })).toEqual({ kind: "next" });
  });
});

describe("mockAuth: cookie mock en producción", () => {
  const cookie = "a24_mock_session=cualquier-valor";

  it("no autentica en producción sin ALLOW_MOCK_AUTH", () => {
    expect(mockSessionFromCookie(cookie, { nodeEnv: "production" })).toBeNull();
    expect(mockSessionFromCookie(cookie, { vercelEnv: "production" })).toBeNull();
  });

  it("autentica en producción sólo con ALLOW_MOCK_AUTH=true", () => {
    expect(mockSessionFromCookie(cookie, { nodeEnv: "production", allowMockAuth: true })).toMatchObject({
      userId: expect.any(String),
      walletAddress: expect.any(String),
    });
  });

  it("fuera de producción autentica como siempre", () => {
    expect(mockSessionFromCookie(cookie, { nodeEnv: "development" })).toMatchObject({
      userId: expect.any(String),
    });
    expect(mockSessionFromCookie(null, { nodeEnv: "development" })).toBeNull();
  });
});

describe("lib/env: ALLOW_MOCK_AUTH", () => {
  async function importAllowMock(value: string | undefined): Promise<unknown> {
    const saved = process.env.ALLOW_MOCK_AUTH;
    if (value === undefined) delete process.env.ALLOW_MOCK_AUTH;
    else process.env.ALLOW_MOCK_AUTH = value;
    vi.resetModules();
    try {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const mod = await import("@/lib/env");
      return mod.serverEnv.ALLOW_MOCK_AUTH;
    } finally {
      if (saved === undefined) delete process.env.ALLOW_MOCK_AUTH;
      else process.env.ALLOW_MOCK_AUTH = saved;
      vi.resetModules();
    }
  }

  it("default false", async () => {
    await expect(importAllowMock(undefined)).resolves.toBe(false);
  });

  it("acepta true/1/yes y false/0/no", async () => {
    await expect(importAllowMock("true")).resolves.toBe(true);
    await expect(importAllowMock("1")).resolves.toBe(true);
    await expect(importAllowMock("yes")).resolves.toBe(true);
    await expect(importAllowMock("false")).resolves.toBe(false);
    await expect(importAllowMock("0")).resolves.toBe(false);
  });

  it("un valor inválido hace fallar el parseo (fail-closed)", async () => {
    await expect(importAllowMock("quizas")).rejects.toThrow(/ALLOW_MOCK_AUTH/);
  });
});
