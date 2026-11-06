import "server-only";

import {
  depositPilotConfigured,
  depositPilotDecision,
  type DepositPilotDecision,
} from "@/lib/deposits/pilot";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Elegibilidad del piloto para un Server Component (la pantalla de depósito).
 *
 * Se calcula en el servidor con `auth.getUser()`: el correo sale de Supabase
 * Auth (no de una cookie, no de un query param) y la verificación es
 * `email_confirmed_at`. El cliente sólo recibe un booleano; nunca la lista ni
 * el correo. Sin sesión, sin configuración o con error → no elegible.
 *
 * Esta lectura es informativa para la UI: la decisión que acredita dinero se
 * vuelve a tomar en el barrido y en la vinculación de billetera, siempre en
 * servidor.
 */
export async function readDepositPilotEligibility(): Promise<{
  eligible: boolean;
  allowlistConfigured: boolean;
  decision: DepositPilotDecision;
}> {
  const configured = depositPilotConfigured();
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return {
        eligible: false,
        allowlistConfigured: configured,
        decision: { allowed: false, reason: configured ? "missing_email" : "not_configured" },
      };
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return {
        eligible: false,
        allowlistConfigured: configured,
        decision: { allowed: false, reason: configured ? "missing_email" : "not_configured" },
      };
    }
    const decision = depositPilotDecision({
      email: data.user.email ?? null,
      emailVerified: Boolean(data.user.email_confirmed_at ?? data.user.confirmed_at),
    });
    return { eligible: decision.allowed, allowlistConfigured: configured, decision };
  } catch {
    return {
      eligible: false,
      allowlistConfigured: configured,
      decision: { allowed: false, reason: configured ? "missing_email" : "not_configured" },
    };
  }
}
