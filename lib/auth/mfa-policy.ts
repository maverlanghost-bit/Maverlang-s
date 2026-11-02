/**
 * Política MFA compartida por navegador, middleware y API.
 * Módulo puro: no crea clientes ni lee entorno.
 *
 * Regla fail-closed: si hay un factor TOTP verificado, la sesión sólo vale
 * con `aal2`. Si el nivel no se puede leer, se trata como pendiente.
 * Sin factor TOTP verificado no hay segundo paso (la app sólo enrola TOTP).
 */

export type TotpFactorLike = {
  factor_type?: string | null;
  status?: string | null;
};

export type AssuranceLevels = {
  currentLevel?: string | null;
  nextLevel?: string | null;
};

/** `true` sólo con un factor TOTP en estado `verified`. */
export function hasVerifiedTotpFactor(factors: readonly TotpFactorLike[] | null | undefined): boolean {
  return (factors ?? []).some(
    (factor) => factor.factor_type === "totp" && factor.status === "verified",
  );
}

/**
 * Navegador: `getAuthenticatorAssuranceLevel` devuelve `nextLevel: "aal2"`
 * cuando existe un factor verificado. Sólo `aal1 → aal1` (o sin sesión)
 * se considera seguro; cualquier nivel desconocido pide el segundo paso.
 */
export function mfaStepFromLevels(levels: AssuranceLevels | null | undefined): boolean {
  if (!levels) return true;
  if (levels.currentLevel === "aal2") return false;
  if (levels.currentLevel === "aal1" && levels.nextLevel === "aal1") return false;
  if (levels.currentLevel === null && levels.nextLevel === null) return false;
  return true;
}

/**
 * Servidor: combina el claim `aal` del JWT ya validado con los factores
 * que devuelve `getUser`. Un `aal` ausente o ilegible con factor verificado
 * se rechaza (no se asume `aal2`).
 */
export function mfaPendingForUser(input: {
  aal: string | null | undefined;
  factors: readonly TotpFactorLike[] | null | undefined;
}): boolean {
  if (!hasVerifiedTotpFactor(input.factors)) return false;
  return input.aal !== "aal2";
}

/**
 * Lee `aal` del payload de un access token. El llamador DEBE haber validado
 * antes la firma con `getUser(jwt)`; esto sólo decodifica, no autentica.
 */
export function accessTokenAal(token: string | null | undefined): string | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { aal?: unknown };
    return typeof payload.aal === "string" ? payload.aal : null;
  } catch {
    return null;
  }
}
