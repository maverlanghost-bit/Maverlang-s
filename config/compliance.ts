/**
 * Cumplimiento geográfico de M75.
 *
 * [REVISIÓN ABOGADO] lista provisoria. La confirma el abogado antes de M88.
 * xStocks no se ofrece en EE.UU. ni a U.S. persons; Canadá, Reino Unido y
 * Australia están restringidos; los sancionados tampoco. Regulation S trata
 * como U.S. person a quien reside en EE.UU. y a las entidades constituidas
 * allá. La ciudadanía sin residencia es zona gris: por defecto también se
 * bloquea (conservador), hasta que el abogado diga otra cosa.
 *
 * Dos niveles:
 * - Navegar (portada, mercado público, ayuda y legal): permitido salvo
 *   sancionados (CU, IR, KP, SY) y las regiones de abajo.
 * - Registrarse y operar en Real: bloqueado si la IP, la residencia, la
 *   nacionalidad o el país del documento (KYC, M76) está en la lista.
 *
 * `GEO_BLOCKED_COUNTRIES` del entorno se suma a la lista base y nunca resta.
 * La lista base no se puede vaciar (la valida M59 en producción).
 *
 * Los VPN no se pueden detectar del todo: una IP de otro país puede pasar
 * este chequeo. Por eso también se pide residencia, nacionalidad y la
 * declaración. El chequeo de la IP en cada cotización real lo conecta M70;
 * esta capa sólo decide.
 */

/** ISO-2 bloqueados para registro y operación real. */
export const BLOCKED_COUNTRIES = [
  "US",
  "PR",
  "GU",
  "VI",
  "AS",
  "MP",
  "UM",
  "CA",
  "GB",
  "AU",
  "CU",
  "IR",
  "KP",
  "SY",
  "RU",
  "BY",
] as const;

/**
 * Sancionados: ni siquiera se navega. Subconjunto de `BLOCKED_COUNTRIES`,
 * fácil de cambiar si el abogado separa las listas.
 */
export const SANCTIONED_COUNTRIES = ["CU", "IR", "KP", "SY"] as const;

/**
 * Regiones, si Vercel manda `x-vercel-ip-country-region`.
 * Crimea (UA-43), Donetsk (UA-14) y Luhansk (UA-09).
 */
export const BLOCKED_REGIONS = ["UA-43", "UA-14", "UA-09"] as const;

export const US_PERSON_DECLARATION_VERSION = "2026-10-draft";

/** [REVISIÓN ABOGADO] Texto versionado de la declaración. */
export const US_PERSON_DECLARATION_TEXT =
  "Declaro que no soy ciudadano ni residente de los Estados Unidos ni de los demás países restringidos, y que no actúo por cuenta de una persona de esos países. [REVISIÓN ABOGADO]";

/** Mensaje de la cotización real. M70 lo devuelve como `GEO_BLOCKED`. */
export const GEO_BLOCKED_MESSAGE = "No podemos ofrecer este servicio en tu ubicación";

const ISO2 = /^[A-Z]{2}$/;

export function normalizeCountry(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase() ?? "";
  return ISO2.test(code) ? code : null;
}

/**
 * Arma `UA-43` desde el país y el header de región.
 * Acepta `43`, `UA-43` o `UA43` cuando el país es UA.
 */
export function normalizeRegion(country: string | null, regionHeader: string | null | undefined): string | null {
  const raw = regionHeader?.trim().toUpperCase() ?? "";
  if (!raw) return null;
  if (/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(raw)) return raw;
  const compact = raw.replace(/[^A-Z0-9]/g, "");
  if (/^[A-Z]{2}[A-Z0-9]{1,3}$/.test(compact) && !ISO2.test(compact)) {
    return `${compact.slice(0, 2)}-${compact.slice(2)}`;
  }
  if (!country || !/^[A-Z0-9]{1,3}$/.test(compact)) return null;
  return `${country}-${compact}`;
}

/** La lista base más los ISO-2 del entorno. Nunca saca un país de la base. */
export function mergeBlockedCountries(extra: readonly string[] | undefined): string[] {
  const set = new Set<string>(BLOCKED_COUNTRIES);
  for (const item of extra ?? []) {
    const code = normalizeCountry(item);
    if (code) set.add(code);
  }
  return [...set];
}

export function isOperationBlocked(country: string | null | undefined, extra: readonly string[] = []): boolean {
  const code = normalizeCountry(country);
  if (!code) return false;
  return mergeBlockedCountries(extra).includes(code);
}

export function isBrowseBlocked(country: string | null, region: string | null): boolean {
  if (country && (SANCTIONED_COUNTRIES as readonly string[]).includes(country)) return true;
  if (region && (BLOCKED_REGIONS as readonly string[]).includes(region)) return true;
  return false;
}

/**
 * M59: en producción la lista base no puede quedar vacía ni perder un país.
 * El entorno no entra acá: sólo suma, en `mergeBlockedCountries`.
 */
export function complianceBaseGaps(base: readonly string[]): string[] {
  if (base.length === 0) return ["GEO_BLOCKED_COUNTRIES"];
  for (const code of BLOCKED_COUNTRIES) {
    if (!base.includes(code)) return ["GEO_BLOCKED_COUNTRIES"];
  }
  return [];
}

export type AccessReason = "sanction" | "region" | "ip" | "residence" | "nationality" | "document";

export type AccessInput = {
  ipCountry: string | null;
  ipRegion?: string | null;
  residenceCountry?: string | null;
  nationalityCountry?: string | null;
  /** País del documento. Lo llena el KYC en M76; hoy puede ir vacío. */
  documentCountry?: string | null;
  extraBlocked?: readonly string[];
};

export type AccessDecision =
  | { navigate: true; operate: true }
  | { navigate: boolean; operate: false; reason: AccessReason };

/** Matriz de M75. Navegar y operar se deciden por separado. */
export function evaluateAccess(input: AccessInput): AccessDecision {
  const country = normalizeCountry(input.ipCountry);
  const region = normalizeRegion(country, input.ipRegion);
  if (isBrowseBlocked(country, region)) {
    const reason: AccessReason =
      country && (SANCTIONED_COUNTRIES as readonly string[]).includes(country) ? "sanction" : "region";
    return { navigate: false, operate: false, reason };
  }
  const extra = input.extraBlocked ?? [];
  if (isOperationBlocked(country, extra)) return { navigate: true, operate: false, reason: "ip" };
  if (isOperationBlocked(input.residenceCountry, extra)) return { navigate: true, operate: false, reason: "residence" };
  if (isOperationBlocked(input.nationalityCountry, extra)) return { navigate: true, operate: false, reason: "nationality" };
  if (isOperationBlocked(input.documentCountry, extra)) return { navigate: true, operate: false, reason: "document" };
  return { navigate: true, operate: true };
}
