import {
  walletChallengeRequestSchema,
  walletChallengeResponseSchema,
} from "@/lib/api/contracts";
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
import { issueWalletLinkChallenge } from "@/lib/services/wallet.supabase";
import { walletLinkDomainOf } from "@/lib/wallet/link-challenge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/me/wallet/challenge — primer paso de la vinculación.
 *
 * Emite un nonce de un solo uso y el mensaje exacto que el cliente debe
 * firmar con su billetera Solana. Todo lo que ata el mensaje sale del
 * servidor:
 * - usuario: la sesión de Supabase verificada (`requireSession`);
 * - DID y billetera: el token de Privy (ES256) y la API de Privy;
 * - dominio: `NEXT_PUBLIC_SITE_URL` o el host de la petición;
 * - propósito, cadena y vencimiento: constantes del servidor (5 minutos).
 *
 * El cuerpo va vacío: ninguna dirección, DID o dominio del cliente se usa.
 * Sin sesión, sin token de Privy, fuera del piloto o sin la migración 0050 se
 * falla cerrado. La respuesta no es la dirección de depósito: es la billetera
 * que Privy atribuye al DID, y sólo sirve para elegir la billetera que firma.
 */
export async function POST(req: Request) {
  return handle("private", async () => {
    assertSameOrigin(req);
    const services = getServices();
    const session = await requireSession(services, req);
    if (!isSupabaseAuth()) {
      throw new DomainError(
        "REAL_DISABLED",
        "La vinculación de billetera sólo está disponible con una cuenta real.",
      );
    }
    const userLimited = await withRateLimit(req, "walletLink", [session.userId]);
    if (userLimited) return userLimited;
    await parseJson(req, walletChallengeRequestSchema);
    const accessToken = privyAccessTokenOf(req);
    if (!accessToken) {
      throw new DomainError(
        "UNAUTHORIZED",
        "Falta el token de Privy para vincular la billetera. Inicia sesión con Privy y vuelve a intentarlo.",
      );
    }
    const domain = walletLinkDomainOf(req);
    const challenge = await callService(req, () =>
      issueWalletLinkChallenge({
        userId: session.userId,
        accessToken,
        identity: { email: session.email, emailVerified: session.emailVerified },
        domain,
      }),
    );
    return readOutput(walletChallengeResponseSchema, challenge);
  });
}
