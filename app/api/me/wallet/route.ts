import { walletsResponseSchema, walletSyncRequestSchema } from "@/lib/api/contracts";
import {
  assertSameOrigin,
  callService,
  handle,
  parseJson,
  readOutput,
  requireSession,
} from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { isSupabaseAuth } from "@/lib/auth/mode";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { privyAccessTokenOf } from "@/lib/services/auth.privy";
import { getUserWallets, syncVerifiedPrivyWallet, type StoredWallet } from "@/lib/services/wallet.supabase";
import { assertWalletLinkingOpen } from "@/lib/wallet/linking-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * M66: billeteras verificadas del usuario (§2.4). `handle("private")` emite
 * `Cache-Control: private, no-store`: datos por usuario, nunca cacheables.
 * La dirección no viaja en el cuerpo: la verifica el servidor contra Privy
 * (`syncVerifiedPrivyWallet`); el POST acepta un cuerpo vacío y nada más.
 *
 * Con identidad Supabase se exige además el access token de Privy (header
 * `Authorization: Bearer` o cookie `privy-token`), verificado con firma ES256.
 * Sin token, sin clave de verificación o sin app secret no se vincula nada.
 * El DID verificado se persiste en `wallets.privy_user_id` (0040): un DID no
 * se puede reasignar a otra cuenta ni una cuenta puede cambiar de DID. Si la
 * migración no está aplicada, el POST real falla cerrado y no guarda nada.
 *
 * BLOQUEO TEMPORAL (2026-11-02): con identidad Supabase el POST responde
 * 503 `REAL_DISABLED` y queda cerrado.
 * La primera asociación de un DID de Privy sólo demuestra posesión simultánea
 * de una sesión Supabase y de un token de Privy, no que ambas identidades sean
 * la misma persona (TOFU). Mientras no exista una prueba verificable de esa
 * correspondencia, este endpoint no vincula ni reasigna nada. El bloqueo cubre
 * toda identidad Supabase (incluida `mv_account=demo`), porque la fila de
 * `public.wallets` se comparte con la cuenta real y permitir la demo sería un
 * bypass trivial. La demo en memoria (`AUTH_MODE=mock`) sigue funcionando.
 * GET no cambia: sólo lee las billeteras ya vinculadas.
 */

function walletsPayload(
  wallets: StoredWallet[],
): { wallets: StoredWallet[]; primaryAddress: string | null } {
  const primary = wallets.find((wallet) => wallet.isPrimary);
  return { wallets, primaryAddress: primary ? primary.address : null };
}

/** Billeteras ya verificadas del usuario autenticado. */
export async function GET(req: Request) {
  return handle("private", async () => {
    const services = getServices();
    const session = await requireSession(services, req);
    const userLimited = await withRateLimit(req, "me", [session.userId]);
    if (userLimited) return userLimited;
    const wallets = await callService(req, () => getUserWallets(session.userId));
    return readOutput(walletsResponseSchema, walletsPayload(wallets));
  });
}

export async function POST(req: Request) {
  return handle("private", async () => {
    assertSameOrigin(req);
    const services = getServices();
    const session = await requireSession(services, req);
    // Bloqueo temporal cerrado: ninguna cuenta Supabase vincula ni reasigna.
    // Se ejecuta antes de leer el cuerpo y de llamar a cualquier servicio.
    assertWalletLinkingOpen();
    // Esquema estricto: cualquier `address` del cliente se rechaza con 400 y
    // jamás llega a la base. La guardada sale de la verificación en servidor.
    await parseJson(req, walletSyncRequestSchema);
    const userLimited = await withRateLimit(req, "me", [session.userId]);
    if (userLimited) return userLimited;
    const requireVerified = isSupabaseAuth();
    const accessToken = privyAccessTokenOf(req);
    if (requireVerified && !accessToken) {
      throw new DomainError(
        "UNAUTHORIZED",
        "Falta el token de Privy para vincular la billetera. Inicia sesión con Privy y vuelve a intentarlo.",
      );
    }
    await callService(req, () =>
      syncVerifiedPrivyWallet({ userId: session.userId, accessToken, requireVerified }),
    );
    const wallets = await getUserWallets(session.userId);
    return readOutput(walletsResponseSchema, walletsPayload(wallets));
  });
}
