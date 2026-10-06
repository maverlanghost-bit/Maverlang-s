/** La tabla `public.profiles` todavía no existe o le faltan columnas. */
export const PROFILE_MIGRATION_MESSAGE = "Falta aplicar la migración de perfiles en Supabase.";

export function isProfileMigrationMessage(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("message" in error)) return false;
  return error.message === PROFILE_MIGRATION_MESSAGE;
}
