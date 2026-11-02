import { afterEach, describe, expect, it, vi } from "vitest";

import { decideGate, type GateInput } from "@/lib/auth/gate";
import {
  __setMfaClientForTests,
  enrollTotp,
  MFA_VERIFY_PATH,
  mfaErrorMessage,
  mfaReturnPath,
  needsMfaStep,
  totpQrSrc,
  verifyTotp,
} from "@/lib/auth/mfa";

type Level = { currentLevel: string | null; nextLevel: string | null };

function clientWith(level: Level, verify = vi.fn(), challenge = vi.fn()) {
  const getAuthenticatorAssuranceLevel = vi.fn(
    async (): Promise<{ data: Level | null; error: { message?: string; status?: number } | null }> => ({
      data: level,
      error: null,
    }),
  );
  return {
    auth: {
      mfa: {
        enroll: vi.fn(),
        challenge,
        verify,
        listFactors: vi.fn(),
        unenroll: vi.fn(),
        getAuthenticatorAssuranceLevel,
      },
    },
  };
}

afterEach(() => {
  __setMfaClientForTests(undefined);
});

describe("needsMfaStep", () => {
  it("sin factor, aal1 hacia aal2, y ya en aal2", async () => {
    __setMfaClientForTests(clientWith({ currentLevel: "aal1", nextLevel: "aal1" }));
    await expect(needsMfaStep()).resolves.toBe(false);

    __setMfaClientForTests(clientWith({ currentLevel: "aal1", nextLevel: "aal2" }));
    await expect(needsMfaStep()).resolves.toBe(true);

    __setMfaClientForTests(clientWith({ currentLevel: "aal2", nextLevel: "aal2" }));
    await expect(needsMfaStep()).resolves.toBe(false);

    __setMfaClientForTests(clientWith({ currentLevel: null, nextLevel: null }));
    await expect(needsMfaStep()).resolves.toBe(false);
  });

  it("falla cerrado si Supabase falla o el nivel no se puede leer", async () => {
    const errored = clientWith({ currentLevel: "aal1", nextLevel: "aal2" });
    errored.auth.mfa.getAuthenticatorAssuranceLevel = vi.fn(async () => ({
      data: null,
      error: { message: "network", status: 500 },
    }));
    __setMfaClientForTests(errored);
    await expect(needsMfaStep()).resolves.toBe(true);

    const empty = clientWith({ currentLevel: "aal1", nextLevel: "aal2" });
    empty.auth.mfa.getAuthenticatorAssuranceLevel = vi.fn(async () => ({ data: null, error: null }));
    __setMfaClientForTests(empty);
    await expect(needsMfaStep()).resolves.toBe(true);

    const thrown = clientWith({ currentLevel: "aal1", nextLevel: "aal2" });
    thrown.auth.mfa.getAuthenticatorAssuranceLevel = vi.fn(async () => {
      throw new Error("boom");
    });
    __setMfaClientForTests(thrown);
    await expect(needsMfaStep()).resolves.toBe(true);

    __setMfaClientForTests(clientWith({ currentLevel: "aal1", nextLevel: "aal3" }));
    await expect(needsMfaStep()).resolves.toBe(true);
  });
});

describe("enrollTotp", () => {
  it("no deja agregar otro factor desde una sesión aal1 con TOTP verificado", async () => {
    const client = clientWith({ currentLevel: "aal1", nextLevel: "aal2" });
    __setMfaClientForTests(client);

    await expect(enrollTotp()).resolves.toEqual({
      ok: false,
      code: "enroll_aal",
      message: mfaErrorMessage("enroll_aal"),
    });
    expect(client.auth.mfa.enroll).not.toHaveBeenCalled();
    expect(client.auth.mfa.listFactors).not.toHaveBeenCalled();
  });

  it("permite el enrolamiento inicial sin factor verificado", async () => {
    const client = clientWith({ currentLevel: "aal1", nextLevel: "aal1" });
    client.auth.mfa.listFactors = vi.fn(async () => ({ data: { all: [] }, error: null }));
    client.auth.mfa.enroll = vi.fn(async () => ({
      data: { id: "factor-1", totp: { qr_code: "", secret: "SECRETO" } },
      error: null,
    }));
    __setMfaClientForTests(client);

    await expect(enrollTotp()).resolves.toEqual({
      ok: true,
      enrollment: { factorId: "factor-1", qrCode: "", secret: "SECRETO" },
    });
    expect(client.auth.mfa.enroll).toHaveBeenCalledOnce();
  });
});

describe("mfaReturnPath", () => {
  it("ignora un next externo y conserva una ruta interna", () => {
    expect(mfaReturnPath("https://evil.test/app")).toBe("/app");
    expect(mfaReturnPath("//evil.test/app")).toBe("/app");
    expect(mfaReturnPath("/app/accion/AAPLx?operar=vender")).toBe("/app/accion/AAPLx?operar=vender");
  });
});

describe("verifyTotp", () => {
  it("un código con letras o de largo distinto de 6 no llama a verify", async () => {
    const verify = vi.fn();
    const challenge = vi.fn();
    __setMfaClientForTests(clientWith({ currentLevel: "aal1", nextLevel: "aal2" }, verify, challenge));

    for (const code of ["12ab56", "12345", "1234567"]) {
      const result = await verifyTotp("factor-1", code);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toBe(mfaErrorMessage("bad_code"));
    }
    expect(verify).not.toHaveBeenCalled();
    expect(challenge).not.toHaveBeenCalled();
  });

  it("traduce el rechazo de Supabase al mensaje humano", async () => {
    const verify = vi.fn(async () => ({
      data: null,
      error: { message: "Invalid TOTP code entered", code: "mfa_verification_failed", status: 422 },
    }));
    const challenge = vi.fn(async () => ({ data: { id: "challenge-1" }, error: null }));
    __setMfaClientForTests(clientWith({ currentLevel: "aal1", nextLevel: "aal2" }, verify, challenge));

    await expect(verifyTotp("factor-1", "000000")).resolves.toEqual({
      ok: false,
      code: "bad_code",
      message: "Código incorrecto o vencido. Intenta con el código nuevo de tu app",
    });
    expect(verify).toHaveBeenCalledOnce();
  });

  it("un código de 6 dígitos llama a challenge y a verify", async () => {
    const verify = vi.fn(async () => ({ data: { access_token: "token" }, error: null }));
    const challenge = vi.fn(async () => ({ data: { id: "challenge-1" }, error: null }));
    __setMfaClientForTests(clientWith({ currentLevel: "aal1", nextLevel: "aal2" }, verify, challenge));

    await expect(verifyTotp("factor-1", "123456")).resolves.toEqual({ ok: true });
    expect(challenge).toHaveBeenCalledWith({ factorId: "factor-1" });
    expect(verify).toHaveBeenCalledWith({ factorId: "factor-1", challengeId: "challenge-1", code: "123456" });
  });
});

describe("pantalla de verificación", () => {
  const session: GateInput = {
    pathname: MFA_VERIFY_PATH,
    search: "?next=%2Fapp",
    countryHeader: "CL",
    countryQuery: null,
    nodeEnv: "test",
    blockedCountries: ["US"],
    mockSession: null,
    onboarding: null,
    privyToken: null,
    usePrivy: false,
    useSupabase: true,
    supabaseSession: true,
    supabaseOnboarded: true,
    supabaseDemoReady: true,
    supabaseMfaRequired: false,
  };

  it("el gate deja la ruta con sesión y sigue sacando al ingreso", () => {
    expect(MFA_VERIFY_PATH).toBe("/app/ingresar/verificar");
    expect(decideGate(session)).toEqual({ kind: "next" });
    expect(decideGate({ ...session, supabaseDemoReady: false })).toEqual({ kind: "next" });
    expect(decideGate({ ...session, pathname: "/app/ingresar" })).toEqual({
      kind: "redirect",
      pathname: "/app",
      search: "",
    });
  });

  it("con TOTP pendiente manda a verificar sólo las rutas privadas", () => {
    const pending: GateInput = { ...session, supabaseMfaRequired: true, pathname: "/app/cartera", search: "?tab=historial" };
    expect(decideGate(pending)).toEqual({
      kind: "redirect",
      pathname: MFA_VERIFY_PATH,
      search: "?next=%2Fapp%2Fcartera%3Ftab%3Dhistorial",
    });

    // La propia verificación, la recuperación de contraseña, el mercado y
    // ajustes (enrolamiento/desactivación) siguen abiertos.
    expect(decideGate({ ...pending, pathname: MFA_VERIFY_PATH, search: "?next=%2Fapp" })).toEqual({ kind: "next" });
    expect(decideGate({ ...pending, pathname: "/app/restablecer", search: "" })).toEqual({ kind: "next" });
    expect(decideGate({ ...pending, pathname: "/app/recuperar", search: "" })).toEqual({ kind: "next" });
    expect(decideGate({ ...pending, pathname: "/app", search: "" })).toEqual({ kind: "next" });
    expect(decideGate({ ...pending, pathname: "/app/accion/AAPLx", search: "" })).toEqual({ kind: "next" });
    expect(decideGate({ ...pending, pathname: "/app/ajustes", search: "" })).toEqual({ kind: "next" });

    // Sin el segundo paso pendiente, el gate no cambia.
    expect(decideGate({ ...pending, supabaseMfaRequired: false })).toEqual({ kind: "next" });
  });

  it("fail-closed: en Supabase, no informar el chequeo MFA también lo exige", () => {
    const withoutMfa: GateInput = { ...session, supabaseMfaRequired: undefined };
    expect(decideGate({ ...withoutMfa, pathname: "/app/cartera", search: "" })).toEqual({
      kind: "redirect",
      pathname: MFA_VERIFY_PATH,
      search: "?next=%2Fapp%2Fcartera",
    });
  });
});

describe("totpQrSrc", () => {
  it("codifica el SVG para que un # no corte la imagen", () => {
    const src = totpQrSrc("data:image/svg+xml;utf-8,<svg fill='#000'/>");
    expect(src.startsWith("data:image/svg+xml;utf-8,")).toBe(true);
    expect(src.includes("#")).toBe(false);
    expect(decodeURIComponent(src.slice("data:image/svg+xml;utf-8,".length))).toContain("<svg");
  });
});
