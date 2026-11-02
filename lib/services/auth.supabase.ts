import "server-only";

import { warnAuthOnce } from "@/lib/auth/mode";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserWallets } from "@/lib/services/wallet.supabase";

const SESSION_WARN = "No se pudo verificar la sesión de Supabase. Se trata como sin sesión.";

/**
 * Usuario verificado con `getUser` (el servidor de Auth). No usa `getSession`.
 *
 * `walletAddress` sale únicamente de `public.wallets`, donde sólo el servidor
 * escribe después de verificar el token de Privy. Si no hay fila (o falta la
 * configuración de Supabase), queda `null`: nunca se inventa ni se usa la
 * billetera demo para una cuenta real.
 */
export const supabaseSessionAuth = {
  async getSession(): Promise<{ userId: string; walletAddress: string | null } | null> {
    try {
      const supabase = await createSupabaseServerClient();
      if (!supabase) return null;
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;
      const wallets = await getUserWallets(data.user.id);
      const primary = wallets.find((wallet) => wallet.isPrimary) ?? null;
      return { userId: data.user.id, walletAddress: primary?.address ?? null };
    } catch {
      warnAuthOnce(SESSION_WARN);
      return null;
    }
  },
};
