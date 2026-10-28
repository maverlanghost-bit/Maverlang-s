/**
 * Texto seguro para una respuesta de cron o un JSON de script.
 * Nunca incluye URLs, JWT ni claves.
 */

export function safeJobError(error: unknown): string {
  let message = "db_error";
  if (error instanceof Error && error.message.trim()) {
    message = error.message;
  } else if (typeof error === "string" && error.trim()) {
    message = error;
  } else if (error !== null && typeof error === "object" && "message" in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === "string" && value.trim()) message = value;
  }
  if (message.includes("Falta la configuración")) return "missing_supabase_secret";
  return message
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[jwt]")
    .replace(/sb_secret_[A-Za-z0-9_-]+/g, "[secret]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 180);
}
