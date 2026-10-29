export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check superficial (M62, SEC-13): responde en < 100 ms sin llamar
 * a nada externo. Cuerpo: `{ ok }` solamente. Sin versión ni entorno.
 * `Cache-Control: no-store`.
 */
export function GET() {
  return Response.json(
    { ok: true as const },
    {
      status: 200,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    },
  );
}
