import { describe, expect, it } from "vitest";

import {
  accessTokenAal,
  hasVerifiedTotpFactor,
  mfaPendingForUser,
  mfaStepFromLevels,
} from "@/lib/auth/mfa-policy";

function token(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.firma`;
}

const VERIFIED = [{ factor_type: "totp", status: "verified" }];

describe("hasVerifiedTotpFactor", () => {
  it("sólo cuenta TOTP verificado", () => {
    expect(hasVerifiedTotpFactor(VERIFIED)).toBe(true);
    expect(hasVerifiedTotpFactor([{ factor_type: "totp", status: "unverified" }])).toBe(false);
    expect(hasVerifiedTotpFactor([{ factor_type: "phone", status: "verified" }])).toBe(false);
    expect(hasVerifiedTotpFactor([])).toBe(false);
    expect(hasVerifiedTotpFactor(null)).toBe(false);
    expect(hasVerifiedTotpFactor(undefined)).toBe(false);
  });
});

describe("mfaStepFromLevels", () => {
  it("sólo deja pasar aal2 o una sesión sin factor", () => {
    expect(mfaStepFromLevels({ currentLevel: "aal2", nextLevel: "aal2" })).toBe(false);
    expect(mfaStepFromLevels({ currentLevel: "aal1", nextLevel: "aal1" })).toBe(false);
    expect(mfaStepFromLevels({ currentLevel: null, nextLevel: null })).toBe(false);
    expect(mfaStepFromLevels({ currentLevel: "aal1", nextLevel: "aal2" })).toBe(true);
  });

  it("falla cerrado ante un nivel ausente o desconocido", () => {
    expect(mfaStepFromLevels(null)).toBe(true);
    expect(mfaStepFromLevels(undefined)).toBe(true);
    expect(mfaStepFromLevels({})).toBe(true);
    expect(mfaStepFromLevels({ currentLevel: "aal1" })).toBe(true);
    expect(mfaStepFromLevels({ currentLevel: "aal1", nextLevel: "aal3" })).toBe(true);
    expect(mfaStepFromLevels({ currentLevel: null, nextLevel: "aal2" })).toBe(true);
  });
});

describe("mfaPendingForUser", () => {
  it("un TOTP verificado sin aal2 queda pendiente", () => {
    expect(mfaPendingForUser({ aal: "aal1", factors: VERIFIED })).toBe(true);
    expect(mfaPendingForUser({ aal: null, factors: VERIFIED })).toBe(true);
    expect(mfaPendingForUser({ aal: undefined, factors: VERIFIED })).toBe(true);
    expect(mfaPendingForUser({ aal: "aal2", factors: VERIFIED })).toBe(false);
  });

  it("sin TOTP verificado no hay segundo paso", () => {
    expect(mfaPendingForUser({ aal: "aal1", factors: [] })).toBe(false);
    expect(mfaPendingForUser({ aal: "aal1", factors: [{ factor_type: "totp", status: "unverified" }] })).toBe(false);
    expect(mfaPendingForUser({ aal: "aal1", factors: null })).toBe(false);
  });
});

describe("accessTokenAal", () => {
  it("lee el claim aal del payload", () => {
    expect(accessTokenAal(token({ sub: "u1", aal: "aal1" }))).toBe("aal1");
    expect(accessTokenAal(token({ sub: "u1", aal: "aal2" }))).toBe("aal2");
    expect(accessTokenAal(token({ sub: "u1" }))).toBeNull();
  });

  it("un token inválido o ausente no inventa un nivel", () => {
    expect(accessTokenAal(null)).toBeNull();
    expect(accessTokenAal(undefined)).toBeNull();
    expect(accessTokenAal("")).toBeNull();
    expect(accessTokenAal("sin-puntos")).toBeNull();
    expect(accessTokenAal("a.%%%.c")).toBeNull();
  });
});
