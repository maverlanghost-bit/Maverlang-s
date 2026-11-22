import "server-only";

import { requireSupabaseUser, type Session } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { isSupabaseAuth } from "@/lib/auth/mode";
import { serverEnv } from "@/lib/env";
import type { Services } from "@/lib/services";


/**
 * MON-8: con `DATA_MODE=live` las rutas de salida de fondos exigen sesión
 * Supabase verificada sin importar `AUTH_MODE`. Si la autenticación no es
 * Supabase no hay sesión verificable → 503 REAL_DISABLED (falla cerrado); sin
 * sesión → 401. En mock (`DATA_MODE≠live`) conserva el flujo demo (null).
 */
export async function requireWalletSession(
  services: Services,
  req: Request,
): Promise<Session | null> {
  if (serverEnv.DATA_MODE !== "live") return requireSupabaseUser(services, req);
  if (!isSupabaseAuth()) throw new DomainError("REAL_DISABLED");
  const session = await requireSupabaseUser(services, req);
  if (!session) throw new DomainError("UNAUTHORIZED");
  return session;
}
