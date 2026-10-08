import { afterEach, describe, expect, it, vi } from "vitest";

import { decideGate, type GateInput } from "@/lib/auth/gate";
import {
  __setMfaClientForTests,
  MFA_VERIFY_PATH,
  mfaErrorMessage,
  mfaReturnPath,
  needsMfaStep,
  totpQrSrc,
  verifyTotp,
} from "@/lib/auth/mfa";

type Level = { currentLevel: string | null; nextLevel: string | null };

function clientWith(level: Level, verify = vi.fn(), challenge = vi.fn()) {
  return {
    auth: {
      mfa: {
        enroll: vi.fn(),
        challenge,
        verify,
        listFactors: vi.fn(),
        unenroll: vi.fn(),
        getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: level, error: null })),
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
});

describe("totpQrSrc", () => {
  it("codifica el SVG para que un # no corte la imagen", () => {
    const src = totpQrSrc("data:image/svg+xml;utf-8,<svg fill='#000'/>");
    expect(src.startsWith("data:image/svg+xml;utf-8,")).toBe(true);
    expect(src.includes("#")).toBe(false);
    expect(decodeURIComponent(src.slice("data:image/svg+xml;utf-8,".length))).toContain("<svg");
  });
});
