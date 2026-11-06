import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regresión de la identidad de depósitos: `confirmed_at` de Supabase Auth
 * también se escribe cuando la cuenta se confirma por TELÉFONO. No prueba el
 * correo.
 *
 * Los tres lectores que deciden elegibilidad usan la misma regla
 * (`email_confirmed_at`): la sesión de la API, el Server Component de la
 * pantalla de depósito y el barrido del cron (admin). Antes los tres hacían
 * `email_confirmed_at ?? confirmed_at`, así que una cuenta sólo-verificada-por-
 * teléfono podía habilitar depósitos.
 *
 * Sin red, sin Supabase real y sin `.env`: se mockean los dos clientes.
 */

const VERIFIED_EMAIL = "cuenta@maverlang.test";

const state = vi.hoisted(() => {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ sub: "user-1", aal: "aal1" })).toString("base64url");
  return {
    token: `${header}.${body}.firma`,
    adminUser: null as Record<string, unknown> | null,
    sessionUser: null as Record<string, unknown> | null,
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: state.adminUser }, error: null }),
      },
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: state.token } },
        error: null,
      }),
      getUser: async () => ({
        data: { user: state.sessionUser },
        error: state.sessionUser ? null : { message: "sin usuario" },
      }),
    },
  }),
}));

// `supabaseSessionAuth` lee la billetera primaria: irrelevante para esta prueba.
vi.mock("@/lib/services/wallet.supabase", () => ({
  getUserWallets: async () => [],
}));

import { hasConfirmedEmail } from "@/lib/auth/email-verification";
import { readDepositEligibility } from "@/lib/deposits/pilot-session";
import { supabaseSessionAuth } from "@/lib/services/auth.supabase";
import { readVerifiedUserEmail } from "@/lib/services/deposits.supabase";

function user(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "user-1",
    email: VERIFIED_EMAIL,
    email_confirmed_at: null,
    confirmed_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  state.adminUser = null;
  state.sessionUser = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("hasConfirmedEmail: sólo la marca del CORREO vale", () => {
  it("acepta email_confirmed_at y rechaza confirmed_at (puede ser teléfono)", () => {
    expect(
      hasConfirmedEmail({ email_confirmed_at: "2026-01-01T00:00:00.000Z", confirmed_at: null }),
    ).toBe(true);
    expect(
      hasConfirmedEmail({ email_confirmed_at: null, confirmed_at: "2026-01-01T00:00:00.000Z" }),
    ).toBe(false);
    expect(hasConfirmedEmail({ email_confirmed_at: "   ", confirmed_at: "2026-01-01" })).toBe(false);
    expect(hasConfirmedEmail(null)).toBe(false);
    expect(hasConfirmedEmail(undefined)).toBe(false);
  });
});

describe("confirmación por teléfono: los tres lectores la rechazan", () => {
  it("barrido (admin): correo sin confirmar aunque confirmed_at exista", async () => {
    state.adminUser = user({ confirmed_at: "2026-01-01T00:00:00.000Z" });

    await expect(readVerifiedUserEmail("user-1")).resolves.toEqual({
      email: VERIFIED_EMAIL,
      emailVerified: false,
    });
  });

  it("pantalla de depósito (Server Component): no elegible", async () => {
    state.sessionUser = user({ confirmed_at: "2026-01-01T00:00:00.000Z" });

    await expect(readDepositEligibility()).resolves.toMatchObject({
      eligible: false,
      decision: { allowed: false, reason: "email_not_verified" },
    });
  });

  it("sesión de la API: emailVerified false", async () => {
    state.sessionUser = user({ confirmed_at: "2026-01-01T00:00:00.000Z" });

    await expect(supabaseSessionAuth.getSession()).resolves.toMatchObject({
      userId: "user-1",
      email: VERIFIED_EMAIL,
      emailVerified: false,
    });
  });

  it("sin ninguna confirmación tampoco habilita", async () => {
    state.adminUser = user();
    state.sessionUser = user();

    await expect(readVerifiedUserEmail("user-1")).resolves.toEqual({
      email: VERIFIED_EMAIL,
      emailVerified: false,
    });
    await expect(readDepositEligibility()).resolves.toMatchObject({
      eligible: false,
      decision: { reason: "email_not_verified" },
    });
    await expect(supabaseSessionAuth.getSession()).resolves.toMatchObject({
      emailVerified: false,
    });
  });
});

describe("correo sí confirmado: los tres lectores habilitan", () => {
  it("email_confirmed_at (y confirmed_at nulo) cuenta como verificado", async () => {
    const confirmed = user({ email_confirmed_at: "2026-01-01T00:00:00.000Z" });
    state.adminUser = confirmed;
    state.sessionUser = confirmed;

    await expect(readVerifiedUserEmail("user-1")).resolves.toEqual({
      email: VERIFIED_EMAIL,
      emailVerified: true,
    });
    await expect(readDepositEligibility()).resolves.toMatchObject({
      eligible: true,
      decision: { allowed: true, reason: "verified" },
    });
    await expect(supabaseSessionAuth.getSession()).resolves.toMatchObject({
      emailVerified: true,
    });
  });
});
