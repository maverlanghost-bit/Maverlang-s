export type LoginErrorCode = "invalid" | "unconfirmed" | "rate" | "network" | "expired" | "weak" | "same" | "unknown";

export function loginErrorMessage(code: LoginErrorCode): string {
  if (code === "invalid") return "El correo o la contraseña no son correctos.";
  if (code === "unconfirmed") return "Confirma tu correo antes de ingresar.";
  if (code === "rate") return "Demasiados intentos. Espera un rato e inténtalo de nuevo.";
  if (code === "network") return "No pudimos conectar. Revisa tu red e inténtalo de nuevo.";
  if (code === "expired") return "El enlace venció o ya no es válido.";
  if (code === "weak") return "La contraseña es muy débil. Usa al menos 8 caracteres.";
  if (code === "same") return "Elige una contraseña distinta a la actual.";
  return "No pudimos completar la acción. Inténtalo otra vez.";
}

export function classifyLoginError(error: {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}): LoginErrorCode {
  const message = `${error.message ?? ""} ${error.code ?? ""}`.toLowerCase();
  const status = error.status ?? 0;
  if (
    status === 429 ||
    message.includes("rate limit") ||
    message.includes("rate_limit") ||
    message.includes("over_email_send") ||
    message.includes("over_request_rate") ||
    message.includes("too many")
  ) {
    return "rate";
  }
  if (message.includes("email not confirmed") || message.includes("email_not_confirmed")) return "unconfirmed";
  if (
    message.includes("invalid login") ||
    message.includes("invalid_credentials") ||
    message.includes("invalid email or password")
  ) {
    return "invalid";
  }
  if (
    message.includes("session_not_found") ||
    message.includes("refresh_token_not_found") ||
    message.includes("auth session missing") ||
    (message.includes("session") && (message.includes("missing") || message.includes("expired") || message.includes("not found")))
  ) {
    return "expired";
  }
  if (message.includes("different from the old") || message.includes("same_password") || message.includes("same password")) {
    return "same";
  }
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
