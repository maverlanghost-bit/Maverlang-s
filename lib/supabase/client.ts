import { createBrowserClient } from "@supabase/ssr";

import { readSupabasePublicConfig } from "@/lib/supabase/config";

/** Cliente de navegador. Null si falta la config: el modo efectivo ya habrá caído a mock. */
export function createSupabaseBrowserClient() {
  const config = readSupabasePublicConfig();
  if (!config) return null;
  return createBrowserClient(config.url, config.publishableKey);
}
