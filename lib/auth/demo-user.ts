import type { SessionUser } from "@/lib/auth/types";

/** Misma cuenta que `lib/mocks/demo-state`. El id no es un DID real de Privy. */
export const DEMO_USER_ID = "did:privy:mock-demo";

/** 32 bytes fijos ("maverlang-demo-wallet-v1"). No es una cuenta con fondos reales. */
export const DEMO_WALLET_ADDRESS = "8MydrPjqgPoNBXrRNPdbX1WCcNvBioNL2E9e2XQ4pQNT";

export const DEMO_SESSION_USER: SessionUser = {
  id: DEMO_USER_ID,
  email: "demo@example.com",
  displayName: "Cuenta demo",
  walletAddress: DEMO_WALLET_ADDRESS,
};
