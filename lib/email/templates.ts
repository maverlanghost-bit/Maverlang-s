import { site, siteOrigin } from "@/config/site";
import { INFO_ONLY_EN, INFO_ONLY_ES } from "@/content/i18n/extra-alertas";
import { formatAlertUsd } from "@/lib/services/alerts-logic";

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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Aviso de que un precio cruzó el nivel pedido. Sin consejo de operar.
 * `thresholdUsd` y `observedUsd` son los números ya calculados por el cron.
 */
export function plantillaAlertaPrecio(input: {
  symbol: string;
  name: string;
  direction: "above" | "below";
  thresholdUsd: number;
  observedUsd: number;
  language: "es-CL" | "en";
}): { subject: string; html: string } {
  const symbol = escapeHtml(input.symbol);
  const name = escapeHtml(input.name);
  const level = escapeHtml(formatAlertUsd(input.thresholdUsd));
  const observed = escapeHtml(formatAlertUsd(input.observedUsd));
  const href = `${siteOrigin()}/app/accion/${encodeURIComponent(input.symbol)}`;
  const favorites = `${siteOrigin()}/app/favoritas`;
  if (input.language === "en") {
    const condition = input.direction === "above" ? "goes above" : "goes below";
    return {
      subject: `Price alert: ${input.symbol}`,
      html: base(
        `<p>Hello,</p>` +
          `<p>Your price alert for ${name} (${symbol}) matched the latest available figure.</p>` +
          `<p>Condition: ${condition} ${level}<br>Figure used: ${observed}</p>` +
          `<p>${INFO_ONLY_EN}</p>` +
          `<p><a href="${href}">View the page</a></p>` +
          `<p><a href="${favorites}">Your alerts</a></p>` +
          `<p>${site.name}</p>`,
      ),
    };
  }
  const condition = input.direction === "above" ? "sube de" : "baja de";
  return {
    subject: `Aviso de precio: ${input.symbol}`,
    html: base(
      `<p>Hola,</p>` +
        `<p>Tu aviso de precio para ${name} (${symbol}) coincidió con el último dato disponible.</p>` +
        `<p>Condición: ${condition} ${level}<br>Dato usado: ${observed}</p>` +
        `<p>${INFO_ONLY_ES}</p>` +
        `<p><a href="${href}">Ver la ficha</a></p>` +
        `<p><a href="${favorites}">Tus avisos</a></p>` +
        `<p>Equipo ${site.name}</p>`,
    ),
  };
}
