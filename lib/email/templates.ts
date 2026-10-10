import { site, siteOrigin } from "@/config/site";

/**
 * Plantillas de correo en español simple y profesional.
 * Módulo puro (sin `server-only`): sólo lo usan rutas y servicios del
 * servidor. La marca sale de `config/site.ts` (`NEXT_PUBLIC_BRAND_NAME`),
 * nunca hardcodeada. Sin cifras de negocio, testimonios ni promesas de
 * rentabilidad.
 */

function base(html: string): string {
  return `<div style="font-family:sans-serif;line-height:1.6;color:#111">${html}</div>`;
}

/** Bienvenida tras un registro demo exitoso. */
export function plantillaBienvenida(): { subject: string; html: string } {
  const appUrl = `${siteOrigin()}/app`;
  return {
    subject: `Bienvenido a ${site.name}`,
    html: base(
      `<p>Hola,</p>` +
        `<p>Gracias por crear tu cuenta demo en ${site.name}. ` +
        `Puedes explorar el mercado y practicar con la cuenta demo, sin dinero real.</p>` +
        `<p><a href="${appUrl}">Ir a la plataforma</a></p>` +
        `<p>Si necesitas ayuda, responde este correo.</p>` +
        `<p>Equipo ${site.name}</p>`,
    ),
  };
}

/** Confirmación al entrar a la lista de espera de la cuenta real. */
export function plantillaListaEspera(): { subject: string; html: string } {
  return {
    subject: `Confirmamos tu lugar en la lista de espera de ${site.name}`,
    html: base(
      `<p>Hola,</p>` +
        `<p>Confirmamos que quedaste en la lista de espera. ` +
        `Te escribiremos a este correo cuando la cuenta real esté disponible.</p>` +
        `<p>Gracias por tu interés.</p>` +
        `<p>Equipo ${site.name}</p>`,
    ),
  };
}
