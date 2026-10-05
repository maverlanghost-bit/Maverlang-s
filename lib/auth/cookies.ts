/** Sesión mock. Cualquier valor no vacío entra como la cuenta demo. */
export const MOCK_SESSION_COOKIE = "a24_mock_session";

/** Onboarding completo en mock. El valor tiene que ser exactamente `1`. */
export const MOCK_ONBOARDING_COOKIE = "a24_onb";

export const ONBOARDING_DONE = "1";

/** Cookie de sesión de Privy. En el navegador suele ser HttpOnly: la limpia `logout()` del SDK. */
export const PRIVY_SESSION_COOKIE = "privy-token";

export function readCookieValue(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    let value: string;
    try {
      value = decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
    return value === "" ? null : value;
  }
  return null;
}
