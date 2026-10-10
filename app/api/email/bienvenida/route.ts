import { NextResponse } from "next/server";
import { z } from "zod";

import { assertSameOrigin, parseJson } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { enviarEmail, remitenteDefault } from "@/lib/email/resend";
import { plantillaBienvenida } from "@/lib/email/templates";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, "Revisa el correo e inténtalo de nuevo.")
      .max(254, "Revisa el correo e inténtalo de nuevo.")
      .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
        message: "Revisa el correo e inténtalo de nuevo.",
      }),
  })
  .strict();

/**
 * `POST /api/email/bienvenida`: correo de bienvenida tras un registro demo
 * exitoso. La llama el cliente después de `signUpDemo`/`signUpRegistro`.
 * Nunca revela nada (siempre 200 si el origen y el cuerpo están bien) y
 * nunca escribe el correo en los logs. Sin `RESEND_API_KEY` se omite.
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
  } catch {
    return NextResponse.json({ error: "El origen de la solicitud no está permitido." }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await parseJson(req, bodySchema);
  } catch (error) {
    if (error instanceof DomainError && error.code === "PAYLOAD_TOO_LARGE") {
      return NextResponse.json({ error: "Los datos son demasiado grandes." }, { status: 413 });
    }
    const message =
      error instanceof DomainError ? error.message : "Revisa los datos e inténtalo de nuevo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  try {
    const { subject, html } = plantillaBienvenida();
    await enviarEmail(remitenteDefault(), body.email, subject, html);
  } catch {
    console.warn("[email] no se pudo enviar la bienvenida");
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
