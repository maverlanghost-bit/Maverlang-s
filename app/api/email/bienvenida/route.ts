import { NextResponse } from "next/server";

import { emailBienvenidaSchema } from "@/lib/api/contracts";
import { assertSameOrigin, parseJson, requireSession } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { enviarEmail, remitenteDefault } from "@/lib/email/resend";
import { plantillaBienvenida } from "@/lib/email/templates";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Correo de la sesión (`auth.users`), nunca el del cuerpo.
 * Sin sesión de Supabase no hay destinatario: no se envía.
 */
async function emailOfSession(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.email) return null;
    const email = data.user.email.trim();
    if (email.length > 254 || !EMAIL.test(email)) return null;
    return email;
  } catch {
    return null;
  }
}

/**
 * `POST /api/email/bienvenida` (SEC-05): sólo con sesión, al correo de
 * `auth.users`, con cupo de 3/h por IP y por usuario. El cuerpo se valida
 * por tamaño y se ignora el email. Nunca se escribe el correo en los logs.
 * Sin `RESEND_API_KEY` se omite el envío.
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
  } catch {
    return NextResponse.json({ error: "El origen de la solicitud no está permitido." }, { status: 403 });
  }
  const ipLimited = await withRateLimit(req, "bienvenidaIp", [], "plain");
  if (ipLimited) return ipLimited;
  const services = getServices();
  let session: { userId: string };
  try {
    session = await requireSession(services, req);
  } catch {
    return NextResponse.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
  }
  const userLimited = await withRateLimit(req, "bienvenida", [session.userId], "plain");
  if (userLimited) return userLimited;
  try {
    await parseJson(req, emailBienvenidaSchema);
  } catch (error) {
    if (error instanceof DomainError && error.code === "PAYLOAD_TOO_LARGE") {
      return NextResponse.json({ error: "Los datos son demasiado grandes." }, { status: 413 });
    }
    const message =
      error instanceof DomainError ? error.message : "Revisa los datos e inténtalo de nuevo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const email = await emailOfSession();
  if (email) {
    try {
      const { subject, html } = plantillaBienvenida();
      await enviarEmail(remitenteDefault(), email, subject, html);
    } catch {
      console.warn("[email] no se pudo enviar la bienvenida");
    }
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
