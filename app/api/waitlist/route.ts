import { NextResponse } from "next/server";

import { waitlistRequestSchema } from "@/lib/api/contracts";
import { assertSameOrigin, parseJson } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { withRateLimit } from "@/lib/security/rate-limit";
import { postWaitlist, WAITLIST_SUCCESS_MESSAGE } from "@/lib/waitlist/server";

export { WAITLIST_SUCCESS_MESSAGE };

export const runtime = "nodejs";

/**
 * `POST /api/waitlist`: correo + `consent: true` + trampa `website` vacía.
 * País desde `x-vercel-ip-country` si existe. Correo repetido o trampa
 * llena → el mismo 200 (no revela si ya estaba). Sin el correo en los logs
 * (M49 le pone rate limit). M56: exige el mismo origen y valida el cuerpo
 * con `parseJson` (16 KB, estricto); la forma de la respuesta no cambia.
 *
 * EXCEPCIÓN M46 (lista blanca de `admin-routes-protected.test.ts`): usa el
 * cliente admin vía `lib/waitlist/server` pero no exige sesión: sólo inserta
 * el correo (`upsert` por `email_norm`, sin leer ni exponer datos de nadie).
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
  } catch {
    return NextResponse.json({ error: "El origen de la solicitud no está permitido." }, { status: 403 });
  }
  const limited = await withRateLimit(req, "waitlist", [], "plain");
  if (limited) return limited;
  let body: unknown;
  try {
    body = await parseJson(req, waitlistRequestSchema);
  } catch (error) {
    if (error instanceof DomainError && error.code === "PAYLOAD_TOO_LARGE") {
      return NextResponse.json({ error: "Los datos son demasiado grandes." }, { status: 413 });
    }
    const message =
      error instanceof DomainError ? error.message : "Revisa los datos e inténtalo de nuevo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const rawCountry = req.headers.get("x-vercel-ip-country")?.trim().toUpperCase() ?? "";
  const country = /^[A-Z]{2}$/.test(rawCountry) ? rawCountry : null;
  try {
    const result = await postWaitlist(body, country);
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    console.error("waitlist: no se pudo guardar el correo");
    return NextResponse.json(
      { error: "No pudimos guardar tu correo. Inténtalo de nuevo." },
      { status: 500 },
    );
  }
}
