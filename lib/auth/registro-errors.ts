import { US_RESIDENT_MESSAGE } from "@/lib/auth/registro-schema";

export type RegistroErrorCode = "already" | "weak" | "rate" | "network" | "blocked" | "unknown";

export function registroErrorMessage(code: RegistroErrorCode): string {
  if (code === "already") return "Ese correo ya tiene una cuenta. Ingresa con ese correo o usa otro.";
  if (code === "weak") return "Esa contraseña es muy débil. Usa al menos 8 caracteres; te recomendamos 12 o más con letras y números.";
  if (code === "rate") return "Llegamos al límite de correos. Espera un rato e inténtalo de nuevo.";
  if (code === "network") return "No pudimos conectar. Revisa tu red e inténtalo de nuevo.";
  if (code === "blocked") return US_RESIDENT_MESSAGE;
  return "No pudimos crear la cuenta. Inténtalo otra vez.";
}

export function classifyAuthError(error: {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}): RegistroErrorCode {
  const message = `${error.message ?? ""} ${error.code ?? ""}`.toLowerCase();
  const status = error.status ?? 0;
  if (
    status === 429 ||
    message.includes("rate limit") ||
    message.includes("rate_limit") ||
    message.includes("over_email_send") ||
    message.includes("too many")
  ) {
    return "rate";
  }
  if (
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("user_already_exists") ||
    message.includes("email_exists")
  ) {
    return "already";
  }
  if (message.includes("registro_us_person") || message.includes("estados unidos")) return "blocked";
  if (
    message.includes("weak_password") ||
    message.includes("pwned") ||
    message.includes("known to be weak") ||
    (message.includes("password") && (message.includes("at least") || message.includes("weak") || message.includes("characters")))
  ) {
    return "weak";
  }
  if (
    error.name === "TypeError" ||
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("network")
  ) {
    return "network";
  }
  return "unknown";
}
