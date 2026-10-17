import { resolveAppEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check superficial (M62): responde en < 100 ms sin llamar a nada
 * externo. Para los monitores de disponibilidad (1 min, 2 regiones).
 * Cuerpo: `{ ok, version, env }` con el sha corto del deploy si está.
 * `Cache-Control: no-store`.
 */
export function GET() {
  const body = {
    ok: true as const,
    version: shortCommit(),
    env: resolveAppEnv(process.env),
  };
  return Response.json(body, {
    status: 200,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

/** sha corto del commit del deploy (7 car.) si Vercel lo manda; si no, null. */
function shortCommit(): string | null {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  return sha ? sha.slice(0, 7) : null;
}
