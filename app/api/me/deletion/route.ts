import { deletionRequestSchema, deletionStatusSchema } from "@/lib/api/contracts";
import { parseJson, assertSameOrigin, callService, handle, readOutput, requireSession } from "@/lib/api/handler";
import { isSupabaseAuth } from "@/lib/auth/mode";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * No está en §2.4. Registra la solicitud (RPC `request_my_deletion` con MFA) y
 * cierra las sesiones; no borra la cuenta: los activos siguen en la billetera.
 * Responde `requestedAt` con la hora que devolvió la base.
 */
export function GET(req: Request) {
  return handle("private", async () => {
    const services = getServices();
    const session = await requireSession(services, req);
    const userLimited = await withRateLimit(req, "me", [session.userId]);
    if (userLimited) return userLimited;
    const data = await callService(req, () => services.users.deletionStatus(session.userId));
    return readOutput(deletionStatusSchema, data);
  });
}

export function POST(req: Request) {
  return handle("private", async () => {
    assertSameOrigin(req);
    const services = getServices();
    const session = await requireSession(services, req);
    await parseJson(req, deletionRequestSchema);
    const userLimited = await withRateLimit(req, "me", [session.userId]);
    if (userLimited) return userLimited;
    const data = await callService(req, () => services.users.requestDeletion(session.userId));
    // AUTH-6: tras pedir la baja se cierran todas las sesiones de la persona (scope global).
    // Si el cierre falla, la solicitud ya quedó registrada: no se devuelve error.
    if (isSupabaseAuth()) {
      try {
        const supabase = await createSupabaseServerClient();
        await supabase?.auth.signOut({ scope: "global" });
      } catch {
        // la solicitud ya está registrada
      }
    }
    return readOutput(deletionStatusSchema, data);
  });
}
