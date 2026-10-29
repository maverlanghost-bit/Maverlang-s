import type { FaqEntry } from "@/lib/content/faq";
import { brandShort } from "@/lib/seo/metadata";

/** Title absoluto de la portada. La plantilla no debe repetir la marca. */
export const HOME_TITLE = `Comprar acciones de EE.UU. desde Chile | ${brandShort()}`;

/** ~150 caracteres: fracciones, acciones tokenizadas, desde Chile y la demo. */
export const HOME_DESCRIPTION =
  "Compra fracciones de acciones tokenizadas de EE.UU. desde Chile. En la demo el saldo es ficticio, las órdenes van en dólares (US$) y se opera 24/7.";

export const HUB_TITLE = `Acciones de EE.UU. desde Chile | ${brandShort()}`;

export const HUB_DESCRIPTION =
  "Acciones tokenizadas de EE.UU. para comprar fracciones desde Chile. Cada ficha es un token que sigue el precio. La demo usa saldo ficticio y opera 24/7.";

export function stockTitle(asset: { name: string; ticker: string }): string {
  return `${asset.name} (${asset.ticker}) desde Chile | ${brandShort()}`;
}

/** Description propia: nombre, ticker, token que sigue el precio, demo y 24/7. */
export function stockDescription(asset: { name: string; ticker: string; etf?: boolean }): string {
  const kind = asset.etf ? "no el ETF en sí" : "no la acción";
  return `${asset.name} (${asset.ticker}) desde Chile: token que sigue el precio, ${kind}. Demo con saldo ficticio, órdenes en dólares (US$) y operación 24/7.`;
}

/** Párrafo visible. No promete ganancias ni dice que la persona es dueña de la acción. */
export function stockParagraph(asset: { name: string; ticker: string; etf?: boolean }): string {
  const kind = asset.etf ? "No es el ETF en sí" : "No es la acción";
  return `${asset.name} (${asset.ticker}) es un token que sigue el precio de ${asset.name}. ${kind} y no te convierte en accionista. La demo usa saldo ficticio y las órdenes van en dólares (US$). Se opera 24/7; fuera del horario regular de la bolsa de EE.UU. el precio puede variar más.`;
}

/** Texto plano de una respuesta del FAQ, con el marcador de borrador si viene. */
export function faqAnswerText(entry: FaqEntry): string {
  return entry.paragraphs
    .map((paragraph) => paragraph.map((part) => (part.kind === "link" ? part.label : part.value)).join(""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
