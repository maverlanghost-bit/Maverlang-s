import "server-only";

import { accessTokenAal, mfaPendingForUser } from "@/lib/auth/mfa-policy";
import { warnAuthOnce } from "@/lib/auth/mode";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserWallets } from "@/lib/services/wallet.supabase";

const SESSION_WARN = "No se pudo verificar la sesión de Supabase. Se trata como sin sesión.";

/**
 * Usuario verificado con `getUser` (el servidor de Auth). No usa `getSession`
 * para decidir la identidad: sólo lee el access token para su claim `aal`.
 *
 * Auditoría 2026-11: si el usuario tiene TOTP verificado y la sesión sigue en
 * `aal1`, no hay sesión para la API (401). Fail-closed: si no se puede leer el
 * token o los factores, tampoco se concede.
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
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? null;
      if (!token) return null;
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) return null;
      if (mfaPendingForUser({ aal: accessTokenAal(token), factors: data.user.factors })) return null;
      const wallets = await getUserWallets(data.user.id);
      const primary = wallets.find((wallet) => wallet.isPrimary) ?? null;
      return { userId: data.user.id, walletAddress: primary?.address ?? null };
    } catch {
      warnAuthOnce(SESSION_WARN);
      return null;
    }
  },
};
