import { walletsResponseSchema, walletSyncRequestSchema } from "@/lib/api/contracts";
import {
  assertSameOrigin,
  callService,
  handle,
  parseJson,
  readOutput,
  requireSession,
} from "@/lib/api/handler";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { getUserWallets, syncVerifiedPrivyWallet, type StoredWallet } from "@/lib/services/wallet.supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * M66: billeteras verificadas del usuario (§2.4). `handle("private")` emite
 * `Cache-Control: private, no-store`: datos por usuario, nunca cacheables.
 * La dirección no viaja en el cuerpo: la verifica el servidor contra Privy
 * (`syncVerifiedPrivyWallet`); el POST acepta un cuerpo vacío y nada más.
 */

function walletsPayload(
  wallets: StoredWallet[],
): { wallets: StoredWallet[]; primaryAddress: string | null } {
  const primary = wallets.find((wallet) => wallet.isPrimary);
  return { wallets, primaryAddress: primary ? primary.address : null };
}

/** El access token de Privy llega por header si la sesión lo expone. */
function privyAccessTokenOf(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return bearer === "" ? null : bearer;
}

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
    // jamás llega a la base. La guardada sale de la verificación en servidor.
    await parseJson(req, walletSyncRequestSchema);
    const userLimited = await withRateLimit(req, "me", [session.userId]);
    if (userLimited) return userLimited;
    const accessToken = privyAccessTokenOf(req);
    await callService(req, () => syncVerifiedPrivyWallet({ userId: session.userId, accessToken }));
    const wallets = await getUserWallets(session.userId);
    return readOutput(walletsResponseSchema, walletsPayload(wallets));
  });
}
