/**
 * Texto escrito por quien comparte: se muestra como texto plano y sin nada que
 * parezca un enlace o una dirección de billetera (anti-phishing con la marca).
 * Sin `server-only`: lo usa la página pública y los tests.
 */

const URL_LIKE =
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|cl|co|app|xyz|me|info|link|ly|gl|dev|ai|site|online|top|click|live|pro)\b(?:\/\S*)?/gi;

/** Dirección Solana (base58, 32–44 caracteres). */
const SOLANA_ADDRESS = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

/** Direcciones tipo 0x… (EVM) y bc1…/1…/3… de Bitcoin largas. */
const OTHER_ADDRESS = /\b0x[a-fA-F0-9]{40}\b|\bbc1[a-z0-9]{25,62}\b/g;

export const LINK_PLACEHOLDER = "[enlace omitido]";
export const ADDRESS_PLACEHOLDER = "[dirección omitida]";

export function neutralizeSharedText(text: string): string {
  return text
    .replace(URL_LIKE, LINK_PLACEHOLDER)
    .replace(OTHER_ADDRESS, ADDRESS_PLACEHOLDER)
    .replace(SOLANA_ADDRESS, ADDRESS_PLACEHOLDER);
}

export const SHARED_NOTICE =
  "Conversación compartida por un usuario. No es una comunicación oficial de Maverlang.";

/** Título de pestaña: deja claro que lo escribió una persona, no la marca. */
export function sharedPageTitle(userTitle: string | null): string {
  if (!userTitle) return "Conversación compartida por un usuario";
  const clean = neutralizeSharedText(userTitle).slice(0, 80);
  return `Conversación compartida por un usuario: «${clean}»`;
}
