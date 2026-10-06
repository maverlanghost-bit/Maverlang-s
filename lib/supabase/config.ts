export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

function text(value: string | undefined): string {
  return value?.trim() ?? "";
}

function httpUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  } catch {
    return null;
  }
  return value.replace(/\/$/, "");
}

/**
 * URL y clave pública. Si se pasa `source`, no lee `process.env`
 * (así los tests no dependen del entorno).
 */
export function readSupabasePublicConfig(source?: {
  url?: string | undefined;
  publishableKey?: string | undefined;
}): SupabasePublicConfig | null {
  const url = httpUrl(text(source ? source.url : process.env.NEXT_PUBLIC_SUPABASE_URL));
  const publishableKey = text(
    source ? source.publishableKey : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}
