import "server-only";

import { warnAuthOnce } from "@/lib/auth/mode";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SESSION_WARN = "No se pudo verificar la sesión de Supabase. Se trata como sin sesión.";

/** Sesión del JWT verificado. La cartera sigue sin billetera: eso no es de esta tarea. */
export const supabaseSessionAuth = {
  async getSession(): Promise<{ userId: string; walletAddress: string | null } | null> {
    try {
      const supabase = await createSupabaseServerClient();
      if (!supabase) return null;
      const { data, error } = await supabase.auth.getClaims();
      if (error || !data?.claims?.sub) return null;
      return { userId: data.claims.sub, walletAddress: null };
    } catch {
      warnAuthOnce(SESSION_WARN);
      return null;
    }
  },
};
