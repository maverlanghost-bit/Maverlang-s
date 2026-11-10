import type { FaqEntry } from "@/lib/content/faq";
import { brandShort } from "@/lib/seo/metadata";

/** Tope de SEO para los títulos: 60 caracteres. */
const TITLE_MAX = 60;
/** Tope de SEO para las descripciones: 155 caracteres (el mínimo sano es 120). */
const DESCRIPTION_MAX = 155;

/**
 * Title absoluto de la portada. La plantilla no debe repetir la marca.
 * Palabras clave: "comprar acciones de EE.UU. desde Chile" y "acciones tokenizadas".
 */
export const HOME_TITLE = `Comprar acciones de EE.UU. desde Chile | ${brandShort()}`;

/** 151 caracteres: fracciones, acciones tokenizadas desde Chile y autocustodia. */
export const HOME_DESCRIPTION =
  "Compra fracciones de acciones tokenizadas de EE.UU. desde Chile, con órdenes en dólares (US$) y autocustodia en tu billetera. Operación 24/7 en Solana.";

/** Palabras clave del hub: "acciones de EE.UU. tokenizadas" y "xStocks". */
export const HUB_TITLE = `Acciones de EE.UU. tokenizadas desde Chile | ${brandShort()}`;

export const HUB_DESCRIPTION =
  "Acciones de EE.UU. tokenizadas (xStocks) para comprar fracciones desde Chile con USDC. Cada ficha es un token que sigue el precio del activo.";

/** Símbolo del token (AAPLx) cuando la ficha lo trae; la ficha de la app puede no tenerlo. */
function tokenSymbol(asset: { symbol?: string }): string | null {
  const symbol = asset.symbol?.trim();
  return symbol ? symbol : null;
}

/**
 * Title de ficha, siempre ≤ 60: "Invertir en {Empresa} ({TICKER}) desde Chile | marca".
 * Con nombres largos se sueltan "desde Chile" y la marca, y al final se recorta el
 * nombre conservando el ticker.
 */
export function stockTitle(asset: { name: string; ticker: string }): string {
  const brand = brandShort();
  const head = `Invertir en ${asset.name} (${asset.ticker})`;
  const candidates = [`${head} desde Chile | ${brand}`, `${head} | ${brand}`, head];
  const fits = candidates.find((candidate) => candidate.length <= TITLE_MAX);
  if (fits) return fits;
  const tail = ` (${asset.ticker})`;
  const prefix = "Invertir en ";
  const room = TITLE_MAX - prefix.length - tail.length - 1;
  if (room <= 0) return `${prefix}${asset.ticker}`.slice(0, TITLE_MAX);
  return `${prefix}${asset.name.slice(0, room).trimEnd()}…${tail}`;
}

/**
 * Description única por ficha, de 120 a 155 caracteres: nombre, ticker, símbolo del
 * token (AAPLx), "con USDC" y la aclaración de que es un token que sigue el precio y
 * no la acción (o el ETF). Sin hablar de la demo: ese aviso va visible en la página.
 */
export function stockDescription(asset: {
  name: string;
  ticker: string;
  symbol?: string;
  etf?: boolean;
}): string {
  const kind = asset.etf ? "no el ETF en sí" : "no la acción";
  const symbol = tokenSymbol(asset);
  const subject = symbol
    ? `${symbol} es un token que sigue el precio de ${asset.name}`
    : `Es un token que sigue el precio de ${asset.name}`;
  const head = `Invertir en ${asset.name} (${asset.ticker}) desde Chile con USDC: `;
  // De la variante más rica a la más corta, para que los nombres largos igual quepan.
  const full = `${head}${subject}, ${kind}.`;
  const medium = symbol
    ? `${head}${symbol} sigue el precio de ${asset.name} (${kind}).`
    : `${head}Sigue el precio de ${asset.name} (${kind}).`;
  const short = symbol
    ? `${head}${symbol} es un token que sigue el precio (${kind}).`
    : `${head}Es un token que sigue el precio (${kind}).`;
  // Cierres opcionales: se agregan sólo si caben en el tope.
  const extras = ["Fracciones desde US$10.", "Autocustodia en Solana."];
  let text = [full, medium, short].find((value) => value.length <= DESCRIPTION_MAX) ?? short;
  for (const extra of extras) {
    const withExtra = `${text} ${extra}`;
    if (withExtra.length <= DESCRIPTION_MAX) text = withExtra;
  }
  if (text.length > DESCRIPTION_MAX) {
    return `${text.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`;
  }
  return text;
}

/** Párrafo visible. No promete ganancias ni dice que la persona es dueña de la acción. */
export function stockParagraph(asset: { name: string; ticker: string; etf?: boolean }): string {
  const kind = asset.etf ? "No es el ETF en sí" : "No es la acción";
  return `${asset.name} (${asset.ticker}) es un token que sigue el precio de ${asset.name}. ${kind} y no te convierte en accionista. La demo usa saldo ficticio y las órdenes van en dólares (US$). Se opera 24/7; fuera del horario regular de la bolsa de EE.UU. el precio puede variar más.`;
}

/** Texto plano de una respuesta del FAQ, con el marcador de borrador si viene. */
export function faqAnswerText(entry: FaqEntry): string {
  return entry.paragraphs
    .map((paragraph) => paragraph.map((part) => (part.kind === "link" ? part.label : part.kind === "marker" ? "" : part.value)).join(""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
