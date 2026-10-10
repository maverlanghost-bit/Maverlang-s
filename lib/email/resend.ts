import "server-only";

import { site } from "@/config/site";

/**
 * Remitente por defecto. Usa `RESEND_FROM_EMAIL` si está definido
 * (dominio verificado en Resend); si no, el remitente de prueba de Resend.
 * La marca sale de `config/site.ts` (`NEXT_PUBLIC_BRAND_NAME`), nunca
 * hardcodeada.
 */
export function remitenteDefault(): string {
  const custom = process.env.RESEND_FROM_EMAIL?.trim();
  if (custom) return custom;
  return `${site.name} <onboarding@resend.dev>`;
}

/**
 * Envía un correo transaccional con Resend. Sólo servidor.
 *
 * Si `RESEND_API_KEY` no existe, registra un aviso y NO falla: el flujo que
 * llama (registro, lista de espera) sigue igual. Nunca escribe el
 * destinatario ni la clave en los logs.
 */
export async function enviarEmail(
  from: string,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[email] falta RESEND_API_KEY: correo omitido");
    return;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!response.ok) {
      console.warn("[email] no se pudo enviar el correo");
    }
  } catch {
    console.warn("[email] no se pudo enviar el correo");
  }
}
