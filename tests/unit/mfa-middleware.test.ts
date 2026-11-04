import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * `updateSession` debe marcar `mfaRequired` en una sesión `aal1` con TOTP
 * verificado. Se mockean Supabase y la configuración: no hay red ni base.
 */
const state = vi.hoisted(() => ({
  claims: { sub: "user-1", aal: "aal1", app_metadata: {} } as Record<string, unknown> | null,
  claimsError: null as { message?: string } | null,
  session: null as { access_token: string } | null,
  user: null as { id: string; factors?: { factor_type: string; status: string }[] } | null,
  userError: null as { message?: string } | null,
  getUserCalls: 0,
}));

vi.mock("@supabase/ssr", () => {
  const empty = { data: [], error: null };
  const builder = {
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(empty).then(resolve, reject),
  };
  return {
    createServerClient: () => ({
      auth: {
        getClaims: async () => ({
          data: state.claims ? { claims: state.claims } : null,
          error: state.claimsError,
        }),
        getSession: async () => ({ data: { session: state.session }, error: null }),
        getUser: async () => {
          state.getUserCalls += 1;
          return { data: { user: state.user }, error: state.userError };
        },
      },
      from: () => ({ select: () => builder }),
    }),
  };
});

vi.mock("@/lib/supabase/config", () => ({
  readSupabasePublicConfig: () => ({ url: "https://proyecto.test", publishableKey: "pk" }),
}));

import { updateSession } from "@/lib/supabase/middleware";

function token(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.firma`;
}

const VERIFIED = [{ factor_type: "totp", status: "verified" }];
const request = new NextRequest("https://maverlang.test/app/cartera");

beforeEach(() => {
  state.claims = { sub: "user-1", aal: "aal1", app_metadata: {} };
  state.claimsError = null;
  state.session = { access_token: token({ sub: "user-1", aal: "aal1" }) };
  state.user = { id: "user-1", factors: [] };
  state.userError = null;
  state.getUserCalls = 0;
});

describe("updateSession y MFA", () => {
  it("marca mfaRequired en aal1 con TOTP verificado", async () => {
    state.user = { id: "user-1", factors: VERIFIED };
    const result = await updateSession(request, { checkMfa: true });
    expect(result.hasSession).toBe(true);
    expect(result.mfaRequired).toBe(true);
    expect(state.getUserCalls).toBe(1);
  });

  it("no exige MFA sin factor o con la sesión en aal2", async () => {
    const result = await updateSession(request, { checkMfa: true });
    expect(result.mfaRequired).toBe(false);

    state.session = { access_token: token({ sub: "user-1", aal: "aal2" }) };
    state.user = { id: "user-1", factors: VERIFIED };
    const upgraded = await updateSession(request, { checkMfa: true });
    expect(upgraded.mfaRequired).toBe(false);
  });

  it("falla cerrado si no puede validar el usuario", async () => {
    state.user = { id: "user-1", factors: VERIFIED };
    state.userError = { message: "auth caído" };
    const result = await updateSession(request, { checkMfa: true });
    expect(result.hasSession).toBe(true);
    expect(result.mfaRequired).toBe(true);
  });

  it("un app_metadata completo no salta el segundo factor", async () => {
    state.claims = {
      sub: "user-1",
      aal: "aal1",
      app_metadata: {
        onboarding_completed: true,
        is_us_person: false,
        terms_version: "2026-10-draft",
        privacy_version: "2026-10-draft",
        us_person_declaration_version: "2026-10-draft",
        us_person_declared_at: "2026-10-08T12:00:00.000Z",
      },
    };
    state.user = { id: "user-1", factors: VERIFIED };
    const result = await updateSession(request, { checkMfa: true });
    expect(result.hasSession).toBe(true);
    expect(result.onboarded).toBe(false);
    expect(result.mfaRequired).toBe(true);
  });

  it("no consulta Auth para MFA cuando la ruta no lo pide", async () => {
    state.user = { id: "user-1", factors: VERIFIED };
    const result = await updateSession(request, { checkMfa: false });
    expect(result.hasSession).toBe(true);
    expect(result.mfaRequired).toBe(false);
    expect(state.getUserCalls).toBe(0);
  });

  it("sin sesión no exige MFA", async () => {
    state.claims = null;
    const result = await updateSession(request, { checkMfa: true });
    expect(result.hasSession).toBe(false);
    expect(result.mfaRequired).toBe(false);
  });
});
