import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => null }));

import { readAdminSession } from "@/lib/admin/guard";
import { isPrivateStorageKey, purgePrivateBrowserStorage } from "@/lib/auth/private-storage";
import { supabaseCookieOptions } from "@/lib/supabase/cookie-options";

type Auth = Parameters<typeof readAdminSession>[0]["auth"];

function authWith(claims: unknown, user: unknown, userError: unknown = null): { auth: Auth } {
  return {
    auth: {
      getClaims: async () => ({ data: claims ? { claims } : null, error: null }),
      getUser: async () => ({ data: { user }, error: userError }),
    } as unknown as Auth,
  };
}

describe("AUTH-4: requireAdmin verifica con getUser", () => {
  it("claims válidos y usuario vivo con el mismo id: sesión con aal", async () => {
    const session = await readAdminSession(authWith({ sub: "u1", aal: "aal2" }, { id: "u1" }));
    expect(session).toEqual({ userId: "u1", aal: "aal2" });
  });

  it("sesión revocada (getUser falla): sin sesión", async () => {
    expect(await readAdminSession(authWith({ sub: "u1", aal: "aal2" }, null, { message: "revoked" }))).toBeNull();
    expect(await readAdminSession(authWith({ sub: "u1", aal: "aal2" }, null))).toBeNull();
  });

  it("sub distinto al del usuario: sin sesión", async () => {
    expect(await readAdminSession(authWith({ sub: "u1", aal: "aal2" }, { id: "u2" }))).toBeNull();
  });

  it("sin claims: sin sesión", async () => {
    expect(await readAdminSession(authWith(null, { id: "u1" }))).toBeNull();
  });
});

describe("AUTH-5: opciones de cookie", () => {
  it("lax, path / y secure sólo en producción", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(supabaseCookieOptions()).toEqual({ path: "/", sameSite: "lax", secure: true });
    vi.stubEnv("NODE_ENV", "development");
    expect(supabaseCookieOptions().secure).toBe(false);
    vi.unstubAllEnvs();
  });
});

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("WEB-8: purga al cerrar sesión", () => {
  it("reconoce las claves privadas y conserva las preferencias", () => {
    for (const key of [
      "mv_saved_recipients_v1:u1",
      "mv_saved_recipients_v1:anon",
      "maverlang_limit_orders_v1",
      "ai:sessions_v1",
      "user-1:sessions_v1",
      "a24_onb_draft",
    ]) {
      expect(isPrivateStorageKey(key), key).toBe(true);
    }
    for (const key of ["a24_favorites", "a24_hide_balance", "mav:logros:v1"]) {
      expect(isPrivateStorageKey(key), key).toBe(false);
    }
  });

  it("borra sólo lo privado y no lanza si el almacén falla", () => {
    const local = fakeStorage();
    local.setItem("mv_saved_recipients_v1:u1", "x");
    local.setItem("maverlang_limit_orders_v1", "x");
    local.setItem("a24_favorites", "x");
    const session = fakeStorage();
    session.setItem("ai:sessions_v1", "x");
    vi.stubGlobal("window", { localStorage: local, sessionStorage: session });
    purgePrivateBrowserStorage();
    expect([...local.data.keys()]).toEqual(["a24_favorites"]);
    expect(session.data.size).toBe(0);

    vi.stubGlobal("window", {
      get localStorage(): never {
        throw new Error("blocked");
      },
      get sessionStorage(): never {
        throw new Error("blocked");
      },
    });
    expect(() => purgePrivateBrowserStorage()).not.toThrow();
    vi.unstubAllGlobals();
  });
});
