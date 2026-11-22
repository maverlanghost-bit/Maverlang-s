/** Tipos de enlace de correo que Supabase puede mandar con `token_hash`. */
export const OTP_TYPES = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;

export type OtpType = (typeof OTP_TYPES)[number];

export function isOtpType(value: string | null | undefined): value is OtpType {
  return typeof value === "string" && (OTP_TYPES as readonly string[]).includes(value);
}

/** Largo razonable de un `token_hash` (hex/base64url); evita reflejar basura en la página de confirmación. */
export function isPlausibleTokenHash(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,256}$/.test(value);
}
