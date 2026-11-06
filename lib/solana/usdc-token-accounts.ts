import "server-only";

import { PublicKey, type Connection } from "@solana/web3.js";

import { USDC_MINT_SOLANA } from "@/lib/wallet/deposit-indexer";

/**
 * Descubrimiento de las cuentas de token USDC de una billetera.
 *
 * Una billetera Solana puede tener, además de su ATA canónica, cuentas de
 * token secundarias del mismo mint. `getSignaturesForAddress(billetera)` no ve
 * las transferencias que entraron sólo a una secundaria (el dueño no firma ni
 * aparece como cuenta en esa transacción), así que el barrido necesita las
 * direcciones de TODAS las cuentas del mint para pedir sus firmas.
 *
 * Reglas:
 * - Sólo cuentas del mint exacto de USDC. Cualquier otra fila que devuelva el
 *   RPC se considera una respuesta no confiable y falla cerrado.
 * - Sólo cuentas cuyo `owner` declarado sea la billetera pedida. El RPC ya
 *   filtra por dueño; si una fila no lo confirma (o no trae datos parseados),
 *   se lanza: no se puede atribuir y el llamador debe omitir la billetera.
 * - La lista es de cuentas ABIERTAS HOY. Una cuenta secundaria cerrada antes
 *   del barrido no se puede descubrir por esta vía: sus depósitos históricos
 *   quedan fuera (limitación documentada, no se inventa soporte).
 *
 * Esta lista se usa SÓLO para saber dónde buscar firmas. La atribución del
 * monto NO usa la propiedad actual: se calcula con los saldos pre/post de la
 * transacción, que son los que dicen quién era el dueño en ese momento.
 */

/** Forma mínima de una fila de `getParsedTokenAccountsByOwner`. */
export interface ParsedOwnedTokenAccountLike {
  pubkey: { toBase58(): string };
  account: {
    data: {
      parsed?:
        | {
            info?: {
              mint?: unknown;
              owner?: unknown;
            } | null;
          }
        | null;
    };
  };
}

export interface ParsedOwnedTokenAccountsResponseLike {
  value: ReadonlyArray<ParsedOwnedTokenAccountLike>;
}

/**
 * Valida la respuesta del RPC y devuelve las direcciones de las cuentas USDC
 * del dueño, sin repetir. Puro: no toca red ni base.
 *
 * Lanza si la respuesta no se puede atribuir con certeza (mint distinto,
 * dueño distinto o ausente, fila sin datos parseados o sin dirección): el
 * llamador trata la billetera como no cubierta en vez de escanear de menos.
 */
export function tokenAccountAddressesForOwner(
  response: ParsedOwnedTokenAccountsResponseLike | null | undefined,
  owner: string,
): string[] {
  const expectedOwner = owner.trim();
  if (expectedOwner === "") throw new Error("billetera vacía");
  if (!response || !Array.isArray(response.value)) {
    throw new Error("respuesta de cuentas de token inválida");
  }

  const seen = new Set<string>();
  const addresses: string[] = [];
  for (const row of response.value) {
    const info = row?.account?.data?.parsed?.info;
    if (!info) throw new Error("cuenta de token sin datos parseados");
    if (info.mint !== USDC_MINT_SOLANA) throw new Error("cuenta de token de otro mint");
    if (typeof info.owner !== "string" || info.owner.trim() !== expectedOwner) {
      throw new Error("cuenta de token de otro dueño");
    }
    const address = row.pubkey?.toBase58?.();
    if (typeof address !== "string" || address.trim() === "") {
      throw new Error("cuenta de token sin dirección");
    }
    if (seen.has(address)) continue;
    seen.add(address);
    addresses.push(address);
  }
  return addresses;
}

/**
 * Cuentas USDC abiertas hoy del dueño (ATA + secundarias). Falla cerrado con
 * cualquier respuesta que no se pueda validar.
 */
export async function listOwnedUsdcTokenAccounts(
  connection: Pick<Connection, "getParsedTokenAccountsByOwner">,
  owner: string,
): Promise<string[]> {
  const address = owner.trim();
  if (address === "") throw new Error("billetera vacía");
  const response = await connection.getParsedTokenAccountsByOwner(new PublicKey(address), {
    mint: new PublicKey(USDC_MINT_SOLANA),
  });
  return tokenAccountAddressesForOwner(
    response as unknown as ParsedOwnedTokenAccountsResponseLike,
    address,
  );
}
