/**
 * DB-03: estado visible del registro real en `/app/onboarding`.
 *
 * Esta decisión es sólo de experiencia: el gate y las guardas del servidor
 * siguen siendo la fuente de verdad. Nunca autoriza operaciones ni escribe
 * evidencia. Su único trabajo es no mostrar el wizard cuando la RPC
 * `update_my_profile` ya no puede cambiar la declaración (perfil con
 * `onboarding_completed = true`).
 */

export type OnboardingProfileStatus =
  /** Perfil sin completar: el wizard real sí puede guardar. */
  | { kind: "pending" }
  /** Perfil completo y con evidencia de la declaración vigente. */
  | { kind: "complete" }
  /**
   * Perfil ya completo sin evidencia de la declaración vigente. La RPC
   * congela identidad y cumplimiento después del onboarding, así que el
   * wizard no puede arreglarlo: se deriva a soporte, sin inventar contacto.
   */
  | { kind: "declaration_review" }
  /** La persona declaró ser de un país restringido. No hay wizard posible. */
  | { kind: "us_person_blocked" };

type ConsentLike = {
  doc?: unknown;
  version?: unknown;
  acceptedAt?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Evidencia mínima que puede leer la UI: un consentimiento `us_person` con la
 * versión vigente y una fecha válida. No reemplaza la evidencia del perfil
 * (`is_us_person`, versión y fecha del servidor); sólo evita prometer que el
 * formulario puede cambiar algo que la RPC bloquea.
 */
export function hasCurrentDeclarationEvidence(
  consents: readonly ConsentLike[],
  currentVersion: string,
): boolean {
  const expected = currentVersion.trim();
  if (expected.length === 0) return false;
  return consents.some((consent) => {
    if (text(consent.doc) !== "us_person") return false;
    if (text(consent.version) !== expected) return false;
    const acceptedAt = text(consent.acceptedAt);
    return acceptedAt.length > 0 && Number.isFinite(Date.parse(acceptedAt));
  });
}

export function onboardingProfileStatus(input: {
  onboardingCompleted: boolean;
  isUsPerson: boolean | null;
  currentDeclarationVersion: string;
  consents: readonly ConsentLike[];
}): OnboardingProfileStatus {
  // Un "sí" explícito no se convierte en un formulario para reintentar.
  if (input.isUsPerson === true) return { kind: "us_person_blocked" };
  if (!input.onboardingCompleted) return { kind: "pending" };
  // Un perfil completo sin respuesta explícita "no" no tiene declaración
  // verificable, aunque exista un consentimiento suelto.
  if (input.isUsPerson !== false) return { kind: "declaration_review" };
  return hasCurrentDeclarationEvidence(input.consents, input.currentDeclarationVersion)
    ? { kind: "complete" }
    : { kind: "declaration_review" };
}

export type SupportChannel =
  | { kind: "email"; href: string; label: string }
  | { kind: "help"; href: "/ayuda"; label: string };

/**
 * Canal de soporte sin inventar contacto: usa `NEXT_PUBLIC_SUPPORT_EMAIL`
 * sólo si es una dirección válida; si no, deja el Centro de ayuda. El asunto
 * es genérico y no lleva datos de la cuenta.
 */
export function supportChannel(email: string | null | undefined): SupportChannel {
  const trimmed = email?.trim() ?? "";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return {
      kind: "email",
      href: `mailto:${trimmed}?subject=${encodeURIComponent("Revisión de registro")}`,
      label: trimmed,
    };
  }
  return { kind: "help", href: "/ayuda", label: "Centro de ayuda" };
}

export const ONBOARDING_STATUS_COPY = {
  completeTitle: "Tu registro ya está completo",
  completeBody: "No necesitas volver a hacerlo. Puedes seguir usando la app.",
  reviewTitle: "Necesitamos revisar tu declaración",
  reviewBody:
    "Tu cuenta ya figura como registrada, pero no encontramos la declaración vigente. Este formulario no puede actualizarla: el sistema no permite cambiar la declaración de una cuenta ya completada.",
  reviewSupport: "Para revisarlo, contacta a soporte.",
  blockedTitle: "No disponible",
  blockedBody:
    "La cuenta no está disponible con la declaración registrada. Si crees que es un error, contacta a soporte.",
  errorTitle: "No pudimos revisar tu registro",
  errorBody:
    "No mostraremos el formulario para no pedirte los datos otra vez sin poder verificar tu estado. Inténtalo de nuevo o contacta a soporte.",
  supportPending: "El correo de soporte está por publicar. Mientras tanto, revisa el Centro de ayuda.",
  retry: "Reintentar",
  backToApp: "Ir a la app",
  logout: "Cerrar sesión",
} as const;
