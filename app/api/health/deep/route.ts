import { timingSafeEqual } from "node:crypto";

import { runDeepHealth } from "@/lib/health/checks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check profundo (M62): dependencias externas en paralelo, cada una
 * con su timeout de 3 s. Requiere `Authorization: Bearer *** (el mismo `CRON_SECRET` de los crons internos). Sin token, con token
 * incorrecto o sin `CRON_SECRET` configurado → 401: nunca queda abierto.
 *
 * 200 si los críticos (Supabase, Jupiter) están OK; 503 si alguno falla.
 * Los chequeos no configurados salen `skipped` y no tiran la salud. Los
 * errores van redactados y cortos: sin URLs con claves.
 * `Cache-Control: no-store`.
 */

/** Lee `CRON_SECRET` en la solicitud (como el cron M55) para que los tests cubran 401/200 sin reimportar. */
function cronSecretFailure(req: Request): Response | null {
  const expected = (process.env.CRON_SECRET ?? "").trim();
  const unauthorized = (): Response =>
    Response.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Necesitas iniciar sesión." } },
      {
        status: 401,
        headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
      },
    );
  if (!expected) return unauthorized();
  const header = req.headers.get("authorization")?.trim() ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || a.length === 0 || !timingSafeEqual(a, b)) {
    return unauthorized();
  }
  return null;
}

const NO_STORE_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
} as const;

export async function GET(req: Request): Promise<Response> {
  const failure = cronSecretFailure(req);
  if (failure) return failure;
  try {
    const report = await runDeepHealth();
    return Response.json(report, {
      status: report.ok ? 200 : 503,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    // runDeepHealth no debería lanzar nunca (cada chequeo atrapa lo suyo);
    // si pasa, el deep mismo no está sano → 503 sin detalles externos.
    console.error(
      "[health/deep] error inesperado:",
      error instanceof Error ? error.message : String(error),
    );
    return Response.json(
      { ok: false, error: { code: "UPSTREAM", message: "El proveedor no respondió." } },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
