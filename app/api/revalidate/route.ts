import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";

import { revalidateBodySchema } from "@/lib/api/contracts";
import { assertSameOrigin, parseJson } from "@/lib/api/handler";
import { COPY_FEED_TAG } from "@/lib/copy/types";
import { withRateLimit } from "@/lib/security/rate-limit";
import { PRICES_TAG } from "@/lib/services/underlying-prices.supabase";

export const runtime = "nodejs";

/**
 * Etiqueta de la caché del feed de Fraccion.si (§1.8). La usan `lib/copy/feed.ts`
 * (`cacheTag("fraccion-feed")`) y este ping para invalidarla.
 */
const FEED_TAG = COPY_FEED_TAG;

function authorized(h: string | null): boolean {
  const secret = process.env.REVALIDATE_SECRET ?? "";
  const got = h?.startsWith("Bearer ") ? h.slice(7) : "";
  const a = Buffer.from(secret);
  const b = Buffer.from(got);
  return secret.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Secreto PROPIO del ping del feed (`FRACCION_REVALIDATE_SECRET`): no comparte
 * el de precios. Comparación en tiempo constante y sin secreto configurado
 * nunca autoriza.
 */
function feedAuthorized(h: string | null): boolean {
  const secret = process.env.FRACCION_REVALIDATE_SECRET?.trim() ?? "";
  const got = h?.startsWith("Bearer ") ? h.slice(7).trim() : "";
  const a = Buffer.from(secret);
  const b = Buffer.from(got);
  return secret.length > 0 && got.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/**
 * `true` sólo si el cuerpo es el ping del feed. Lee un CLON: el cuerpo original
 * queda intacto para el camino de precios, que se comporta igual que siempre.
 */
async function isFeedPing(req: Request): Promise<boolean> {
  try {
    const body = await parseJson(req.clone(), revalidateBodySchema);
    return body.tag === FEED_TAG;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const limited = await withRateLimit(req, "cron");
  if (limited) return limited;

  /**
   * Feed de Fraccion.si: `{ tag: "fraccion-feed", … }` con su propio Bearer.
   * Sólo invalida la etiqueta de datos; no toca precios ni otra caché.
   */
  if (await isFeedPing(req)) {
    if (!process.env.FRACCION_REVALIDATE_SECRET) {
      return Response.json(
        { ok: false, error: "Revalidación del feed no configurada." },
        { status: 503 },
      );
    }
    if (!feedAuthorized(req.headers.get("authorization"))) {
      return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
    }
    // Exenta de Origin (la llama el export de Fraccion). parseJson acepta cuerpo vacío.
    assertSameOrigin(req);
    const ping = await parseJson(req, revalidateBodySchema);
    // Contrato v1 (docs/FRACCION_FEED_FORMATO.md): el ping trae los seis campos.
    if (
      ping.source !== "fraccion.si" ||
      !ping.generated_at ||
      !ping.status ||
      !ping.index_sha256 ||
      !ping.key_id
    ) {
      return Response.json({ ok: false, error: "Ping del feed incompleto." }, { status: 400 });
    }
    if (ping.example === true && process.env.NODE_ENV === "production") {
      return Response.json({ ok: false, error: "Ping de ejemplo." }, { status: 400 });
    }
    // Si Maverlang fija el key_id esperado, un ping de otra clave no invalida nada.
    const expectedKeyId = process.env.FRACCION_FEED_ED25519_KEY_ID?.trim() ?? "";
    if (expectedKeyId && ping.key_id !== expectedKeyId) {
      return Response.json({ ok: false, error: "Clave del feed desconocida." }, { status: 409 });
    }
    // El ping solo avisa: el índice se vuelve a bajar y a verificar con la firma.
    revalidateTag(FEED_TAG, "max");
    return Response.json({ ok: true, tags: [FEED_TAG] });
  }

  // Camino actual de precios: idéntico (mismo orden de guardas y misma respuesta).
  if (!process.env.REVALIDATE_SECRET) {
    return Response.json({ ok: false, error: "Revalidación no configurada." }, { status: 503 });
  }
  if (!authorized(req.headers.get("authorization"))) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  // Exenta de Origin (la llama GitHub Actions). parseJson acepta cuerpo vacío.
  assertSameOrigin(req);
  await parseJson(req, revalidateBodySchema);
  revalidateTag(PRICES_TAG, "max");
  return Response.json({ ok: true, tags: [PRICES_TAG] });
}
