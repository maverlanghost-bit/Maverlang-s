import "server-only";

import { hasConfirmedEmail } from "@/lib/auth/email-verification";
import {
  depositEligibilityDecision,
  type DepositEligibilityDecision,
} from "@/lib/deposits/pilot";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Elegibilidad de depósitos para un Server Component (la pantalla de depósito).
 *
 * Se calcula en el servidor con `auth.getUser()`: el correo sale de Supabase
 * Auth (no de una cookie, no de un query param) y la verificación es
 * `email_confirmed_at`. `confirmed_at` NO sirve: Supabase también lo escribe
 * al confirmar por teléfono. No hay lista de correos: cualquier cuenta
 * registrada con el correo verificado es elegible. El cliente sólo recibe un
 * booleano; nunca el correo.
 *
 * Sin sesión o con error → no elegible. Esta lectura es informativa para la
 * UI: la decisión que acredita dinero se vuelve a tomar en el barrido y en la
 * vinculación de billetera, siempre en servidor.
 */
export async function readDepositEligibility(): Promise<{
  eligible: boolean;
  decision: DepositEligibilityDecision;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return { eligible: false, decision: { allowed: false, reason: "missing_email" } };
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return { eligible: false, decision: { allowed: false, reason: "missing_email" } };
    }
    const decision = depositEligibilityDecision({
      email: data.user.email ?? null,
      emailVerified: hasConfirmedEmail(data.user),
    });
    return { eligible: decision.allowed, decision };
  } catch {
    return { eligible: false, decision: { allowed: false, reason: "missing_email" } };
  }
}
