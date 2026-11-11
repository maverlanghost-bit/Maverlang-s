import { z } from "zod";

import { assertSameOrigin, handle, parseJson, requireSession } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { copyFeatureDisabledResponse, isCopyEnabled } from "@/lib/copy/flags";
import { redeemFraccionPro } from "@/lib/copy/fraccion-pro";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";

/**
 * POST /api/copy/fraccion-pro — vincula un comprobante de Fraccion Pro
 * (§1.3: Fraccion Pro incluye Copiar).
 *
 * Cuerpo: `{ token }` con el comprobante firmado Ed25519 que emite Fraccion
 * `{ sub_email_sha256, plan: "pro", exp }`. El correo NUNCA viene del cliente:
 * se usa el de la sesión y se compara su sha256 con el del comprobante.
 *
 * Respuestas: 200 con el estado vinculado; 400 si el comprobante no calza;
 * 401 sin sesión; 404 `FEATURE_DISABLED` con la sección apagada; 503 si falta
 * la clave pública o no se pudo guardar.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Solo el comprobante. `.strict()` rechaza campos extra. */
const fraccionProBodySchema = z
  .object({ token: z.string().trim().min(16).max(4096) })
  .strict();

function unavailable(message: string): Response {
  return Response.json(
    { ok: false, error: { code: "FEATURE_DISABLED", message } },
    { status: 503, headers: { "cache-control": "private, no-store" } },
  );
}

export function POST(req: Request) {
  return handle("private", async () => {
    assertSameOrigin(req);
    if (!(await isCopyEnabled())) return copyFeatureDisabledResponse();

    const services = getServices();
    const session = await requireSession(services, req);
    const limited = await withRateLimit(req, "me", [session.userId]);
    if (limited) return limited;

    const body = await parseJson(req, fraccionProBodySchema);

    const email = session.email?.trim() ?? "";
    if (email === "") {
      throw new DomainError("VALIDATION", "Falta el correo de tu cuenta.");
    }
    if (session.emailVerified === false) {
      throw new DomainError("VALIDATION", "Confirma tu correo antes de vincular Fraccion Pro.");
    }

    const result = await redeemFraccionPro({
      userId: session.userId,
      email,
      token: body.token,
    });

    if (result.ok) {
      return {
        entitlement: "fraccion_pro",
        plan: "pro",
        currentPeriodEnd: result.currentPeriodEnd,
      };
    }

    switch (result.reason) {
      case "disabled":
      case "misconfigured":
        return unavailable("Vincular Fraccion Pro no está disponible todavía.");
      case "expired":
        throw new DomainError(
          "VALIDATION",
          "El comprobante de Fraccion Pro venció. Pide uno nuevo en Fraccion.si.",
        );
      case "email_mismatch":
        throw new DomainError(
          "VALIDATION",
          "El comprobante de Fraccion Pro corresponde a otro correo.",
        );
      case "already_subscribed":
        throw new DomainError(
          "VALIDATION",
          "Ya tienes acceso a Copiar carteras. Vincula Fraccion Pro cuando termine tu período actual.",
        );
      case "store_error":
        throw new DomainError("INTERNAL");
      case "invalid":
      default:
        throw new DomainError("VALIDATION", "El comprobante de Fraccion Pro no es válido.");
    }
  });
}
