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
import { walletLinkDomainOf } from "@/lib/wallet/link-challenge";
import { assertWalletLinkingOpen } from "@/lib/wallet/linking-policy";
import type { WalletLinkingProof } from "@/lib/wallet/linking-proof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * M66: billeteras verificadas del usuario (§2.4). `handle("private")` emite
 * `Cache-Control: private, no-store`: datos por usuario, nunca cacheables.
 * La dirección no viaja en el cuerpo: la verifica el servidor contra Privy.
 *
 * Paso 2 del piloto de depósitos — vinculación con prueba de posesión:
 * - GET sólo lee las billeteras ya vinculadas.
 * - POST exige, con identidad Supabase, el nonce emitido por
 *   `POST /api/me/wallet/challenge` y la firma ed25519 del mensaje exacto.
 *   El servidor verifica el token ES256 de Privy, lee la billetera de la API
 *   de Privy para el DID verificado, consume el nonce de forma atómica (un
 *   solo uso) y comprueba la firma antes de persistir. Una sesión Supabase y
 *   un token de Privy juntos NO bastan (TOFU): sin firma no hay vinculación.
 * - El DID se persiste en `wallets.privy_user_id` (0040) con índice único, y
 *   la dirección es única por cadena (0029): ni un DID ni una billetera se
 *   reasignan a otra cuenta. El desafío vive en la migración 0050.
 * - Si falta la migración 0050 o 0040, el POST falla cerrado y no guarda nada.
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
    // Esquema estricto: cualquier `address` del cliente se rechaza con 400 y
    // jamás llega a la base. Sólo se aceptan nonce y firma.
    const body = await parseJson(req, walletSyncRequestSchema);
    const proof: WalletLinkingProof | undefined =
      body.nonce !== undefined && body.signature !== undefined
        ? { nonce: body.nonce, signature: body.signature }
        : undefined;
    const requireVerified = isSupabaseAuth();
    // Sin prueba declarada no se sigue: con identidad Supabase la vinculación
    // sin firma está cerrada (REAL_DISABLED). El servicio repite la guardia.
    if (requireVerified) assertWalletLinkingOpen(proof);
    const userLimited = await withRateLimit(req, "walletLink", [session.userId]);
    if (userLimited) return userLimited;
    const accessToken = privyAccessTokenOf(req);
    if (requireVerified && !accessToken) {
      throw new DomainError(
        "UNAUTHORIZED",
        "Falta el token de Privy para vincular la billetera. Inicia sesión con Privy y vuelve a intentarlo.",
      );
    }
    // Dominio atado al mensaje: el mismo que nombró el desafío. Se deriva del
    // sitio canónico, nunca de un campo del cliente.
    const domain = requireVerified ? walletLinkDomainOf(req) : null;
    await callService(req, () =>
      syncVerifiedPrivyWallet({
        userId: session.userId,
        accessToken,
        requireVerified,
        // Piloto interno: la identidad sale de Supabase Auth (correo
        // verificado), nunca del cuerpo ni de una cabecera del cliente.
        identity: { email: session.email, emailVerified: session.emailVerified },
        proof,
        domain,
      }),
    );
    const wallets = await getUserWallets(session.userId);
    return readOutput(walletsResponseSchema, walletsPayload(wallets));
  });
}
