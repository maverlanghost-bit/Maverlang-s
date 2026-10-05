import "server-only";

/**
 * TODO sesión Privy (ARQUITECTURA §10). `@privy-io/server-auth` no está instalado.
 * Endpoint: no es HTTP nuestro. `PrivyClient(NEXT_PUBLIC_PRIVY_APP_ID, PRIVY_APP_SECRET).verifyAuthToken(token)`.
 *   El token sale de la cookie `privy-token`. Después `getUser(userId)` y la embedded wallet
 *   con chainType `solana`.
 * Mapeo: `{ userId: did, walletAddress }` o null si no hay wallet embebida.
 * Errores: cookie ausente o token inválido → null (el handler pone 401). No lanzar.
 *   Caída de Privy → UPSTREAM. Sin `PRIVY_APP_SECRET` → INTERNAL.
 * Cache: no. Cada request verifica el token.
 */
export const privyAuth = {
  async getSession(): Promise<{ userId: string; walletAddress: string | null } | null> {
    throw new Error("NOT_IMPLEMENTED: verificar privy-token");
  },
};
