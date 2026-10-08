import "server-only";

import { notFound } from "next/navigation";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AdminSession = {
  userId: string;
  aal: string;
};

export type AdminGuardDeps = {
  readSession: () => Promise<AdminSession | null>;
  isAdmin: (userId: string) => Promise<boolean>;
  deny: () => never;
};

/**
 * Sesión a partir de los claims de `getClaims`. Sin `sub` o con error no hay sesión.
 * `aal` vacío no es `aal2`.
 */
export function sessionFromClaims(
  claims: { sub?: unknown; aal?: unknown } | null | undefined,
  failed: boolean,
): AdminSession | null {
  if (failed || !claims) return null;
  if (typeof claims.sub !== "string" || claims.sub.length === 0) return null;
  const aal = typeof claims.aal === "string" ? claims.aal : "";
  return { userId: claims.sub, aal };
}

/**
 * Exige admin con MFA. Si falta la sesión, el nivel no es `aal2` o el usuario
 * no está en `app_admins`, llama a `deny` (en producción, `notFound`).
 */
export async function assertAdmin(deps: AdminGuardDeps): Promise<{ userId: string }> {
  let session: AdminSession | null = null;
  try {
    session = await deps.readSession();
  } catch {
    session = null;
  }
  if (!session || session.aal !== "aal2") deps.deny();
  let allowed = false;
  try {
    allowed = await deps.isAdmin(session.userId);
  } catch {
    allowed = false;
  }
  if (!allowed) deps.deny();
  return { userId: session.userId };
}

async function readSessionFromClaims(): Promise<AdminSession | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  return sessionFromClaims(data?.claims ?? null, Boolean(error));
}

async function isAppAdmin(userId: string): Promise<boolean> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("app_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return false;
    return data.user_id === userId;
  } catch {
    return false;
  }
}

let testDeps: AdminGuardDeps | null = null;

/** Sólo tests. En producción no cambia el guard. */
export function __setAdminGuardForTests(next: AdminGuardDeps | null): void {
  if (process.env.NODE_ENV === "production") return;
  testDeps = next;
}

/**
 * Admin con MFA (`aal2`) y fila en `app_admins`. Si no, 404: no revela el panel.
 */
export async function requireAdmin(): Promise<{ userId: string }> {
  return assertAdmin(
    testDeps ?? {
      readSession: readSessionFromClaims,
      isAdmin: isAppAdmin,
      deny: () => notFound(),
    },
  );
}
