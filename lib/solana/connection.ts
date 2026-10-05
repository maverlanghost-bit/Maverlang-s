import { Connection, clusterApiUrl, type Cluster, type Commitment } from "@solana/web3.js";

/**
 * RPC de Solana. No crea la conexión al importar.
 * Cliente: `NEXT_PUBLIC_SOLANA_RPC_URL` o el cluster público.
 * Servidor: `SOLANA_RPC_URL` y, si falta, el mismo público.
 * No importa `serverEnv`: ese módulo es `server-only` y este archivo
 * también lo puede usar el cliente (`getClientConnection`).
 * El RPC privado no va al bundle del cliente: Next no inlinea env sin `NEXT_PUBLIC_`.
 */

const COMMITMENT: Commitment = "confirmed";

function clean(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

function isCluster(value: string): value is Cluster {
  return value === "mainnet-beta" || value === "devnet" || value === "testnet";
}

export function publicCluster(): Cluster {
  const value = clean(process.env.NEXT_PUBLIC_SOLANA_CLUSTER);
  return value && isCluster(value) ? value : "mainnet-beta";
}

export function publicRpcUrl(): string {
  return clean(process.env.NEXT_PUBLIC_SOLANA_RPC_URL) ?? clusterApiUrl(publicCluster());
}

export function serverRpcUrl(): string {
  return clean(process.env.SOLANA_RPC_URL) ?? publicRpcUrl();
}

/** Lecturas desde el navegador. Sólo la URL pública. */
export function getClientConnection(): Connection {
  return new Connection(publicRpcUrl(), COMMITMENT);
}

/** Lecturas desde Route Handlers. Prefiere el RPC privado. */
export function getServerConnection(): Connection {
  return new Connection(serverRpcUrl(), COMMITMENT);
}
