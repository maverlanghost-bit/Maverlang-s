import "server-only";

/**
 * TODO: verificar la cookie `privy-token` con @privy-io/server-auth (ARQUITECTURA §10).
 * Devolver el DID de Privy y la wallet embebida de Solana. Sin token válido → null.
 * PRIVY_APP_SECRET sólo en servidor.
 */
export const privyAuth = {
  async getSession(): Promise<{ userId: string; walletAddress: string | null } | null> {
    throw new Error("NOT_IMPLEMENTED: verificar privy-token");
  },
};
