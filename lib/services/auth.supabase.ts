import "server-only";

import { warnAuthOnce } from "@/lib/auth/mode";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SESSION_WARN = "No se pudo verificar la sesión de Supabase. Se trata como sin sesión.";

/**
 * Usuario verificado con `getUser` (el servidor de Auth). No usa `getSession`.
 * La billetera real todavía no está ligada: `walletAddress` queda null.
 */
export const supabaseSessionAuth = {
  async getSession(): Promise<{ userId: string; walletAddress: string | null } | null> {
    try {
      const supabase = await createSupabaseServerClient();
      if (!supabase) return null;
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;
      return { userId: data.user.id, walletAddress: null };
    } catch {
      warnAuthOnce(SESSION_WARN);
      return null;
    }
  },
};
