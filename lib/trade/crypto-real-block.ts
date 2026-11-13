import "server-only";

import { CRYPTO_REAL_BLOCK_MESSAGE } from "@/content/crypto-legal";
import { DomainError } from "@/lib/api/result";
import { positionMeta } from "@/lib/catalog/position-meta";

/**
 * Bloqueo de dinero real para criptos y staking (G4, decisión §1.1).
 *
 * La compra/venta de criptos y el staking (LST y USDY) existen SÓLO en la
 * demo. La cuenta real que intente cotizar, armar o enviar uno de esos
 * activos recibe `VALIDATION` con el texto exacto de
 * `CRYPTO_REAL_BLOCK_MESSAGE`, sin llegar a valorar, reservar cupo ni pedir
 * transacciones a Jupiter.
 *
 * Es un bloqueo de producto/legal y NO depende de los flags `REAL_*`: aunque
 * mañana se habilite la compra real de acciones, criptos y staking siguen
 * cerrados hasta la revisión de un abogado (CMF / Ley Fintec 21.521).
 *
 * El reconocimiento del símbolo usa el mismo índice que la cartera
 * (`positionMeta`, catálogos K1/K2, comparación sin distinguir mayúsculas):
 * cubre las 29 criptos, los 6 LST y USDY. Un símbolo que no está en esos
 * catálogos (una acción, por ejemplo) no se bloquea acá. No agregar acciones
 * a `positionMeta`: esa lista es la frontera demo/real de este helper.
 *
 * La rama demo no llama a esta función: cada ruta la invoca únicamente
 * cuando la cuenta es real.
 */

/** true si el símbolo pertenece a los catálogos de cripto/LST/USDY. */
function isCryptoOrEarnSymbol(symbol: string): boolean {
  return positionMeta(symbol) !== null;
}

/**
 * Corta la operación si el símbolo es cripto, LST o USDY y la cuenta es real.
 * En demo (o con un símbolo fuera de esos catálogos) no hace nada.
 */
export function assertCryptoDemoOnly(symbol: string, isRealAccount: boolean): void {
  if (!isRealAccount) return;
  if (!isCryptoOrEarnSymbol(symbol)) return;
  throw new DomainError("VALIDATION", CRYPTO_REAL_BLOCK_MESSAGE);
}
