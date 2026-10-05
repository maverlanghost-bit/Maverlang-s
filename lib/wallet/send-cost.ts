import { addressesEqual } from "@/lib/solana/address";

/** 5000 lamports. No es comisión de la plataforma. */
export const NETWORK_FEE_SOL = 0.000005;
/** ARQUITECTURA §6. Se muestra en SOL; no se pasa a dólares ni a pesos. */
export const TOKEN_ACCOUNT_RENT_SOL = 0.0016;

export type SendCost = {
  networkFeeSol: number;
  tokenAccountRentSol: number;
};

/**
 * Mock: no hay consulta a la cadena.
 * La propia billetera ya tiene la cuenta del token, así que la rent es 0.
 * Cualquier otra dirección se trata como sin cuenta.
 */
export function sendNetworkCost(to: string, from: string): SendCost {
  const own = addressesEqual(to, from);
  return {
    networkFeeSol: NETWORK_FEE_SOL,
    tokenAccountRentSol: own ? 0 : TOKEN_ACCOUNT_RENT_SOL,
  };
}

export function solCoversFee(solUi: number, cost: SendCost): boolean {
  return solUi + 1e-12 >= cost.networkFeeSol + cost.tokenAccountRentSol;
}

/** Bajo si no alcanza para abrir una cuenta de token y pagar la red. */
export function solIsLow(solUi: number): boolean {
  return !solCoversFee(solUi, {
    networkFeeSol: NETWORK_FEE_SOL,
    tokenAccountRentSol: TOKEN_ACCOUNT_RENT_SOL,
  });
}

const solFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 9 });

export function formatSol(value: number): string {
  return `${solFormatter.format(value)} SOL`;
}
