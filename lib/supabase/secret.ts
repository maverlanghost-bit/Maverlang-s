import "server-only";

function text(value: string | undefined): string {
  return value?.trim() ?? "";
}

/**
 * Clave de servidor. `SUPABASE_SECRET_KEY` manda.
 * Si no está, se acepta el nombre viejo `SUPABASE_SERVICE_ROLE_KEY`.
 * Sólo servidor: no importar desde componentes cliente.
 */
export function readSupabaseSecretKey(source?: {
  secret?: string | undefined;
  legacy?: string | undefined;
}): string | null {
  const secret = text(source ? source.secret : process.env.SUPABASE_SECRET_KEY);
  if (secret) return secret;
  const legacy = text(source ? source.legacy : process.env.SUPABASE_SERVICE_ROLE_KEY);
  return legacy || null;
}
