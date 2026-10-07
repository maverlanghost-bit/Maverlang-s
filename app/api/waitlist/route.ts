import { NextResponse } from "next/server";

import { withRateLimit } from "@/lib/security/rate-limit";
import { postWaitlist, WAITLIST_SUCCESS_MESSAGE } from "@/lib/waitlist/server";

export { WAITLIST_SUCCESS_MESSAGE };

export const runtime = "nodejs";

/**
 * `POST /api/waitlist`: correo + `consent: true` + trampa `website` vacía.
 * País desde `x-vercel-ip-country` si existe. Correo repetido o trampa
 * llena → el mismo 200 (no revela si ya estaba). Sin el correo en los logs
 * (M49 le pone rate limit).
 */
export async function POST(req: Request) {
  const limited = await withRateLimit(req, "waitlist", [], "plain");
  if (limited) return limited;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo no es JSON." }, { status: 400 });
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
