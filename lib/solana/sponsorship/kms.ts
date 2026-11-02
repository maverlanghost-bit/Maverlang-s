import "server-only";

import {
  SponsorError,
  type SponsorKms,
  type SponsorSignInput,
  type SponsorSignOutput,
} from "./contracts";

/**
 * Stub explícito de KMS/HSM.
 *
 * No hay implementación de firma en este repositorio y no debe haberla con
 * una clave privada en env. El paso pendiente es conectar un KMS gestionado
 * (AWS KMS, GCP KMS, Turnkey, Fireblocks u otro) que:
 * 1. Tenga la clave del fee-payer del sponsor y exponga sólo su PUBLIC KEY.
 * 2. Firme exactamente el mensaje cuyo SHA-256 recibe en `messageSha256`.
 * 3. Devuelva la transacción completa con la firma del sponsor.
 *
 * `verifySponsorSignature` vuelve a comprobar el mensaje y la firma, así que
 * un KMS mal configurado no puede colar una transacción distinta.
 */
export const KMS_REQUIRED_MESSAGE =
  "Patrocinio sin firmante: falta conectar un KMS/HSM con la clave del fee-payer. No se firmó nada.";

export function requireSponsorKms(): never {
  throw new SponsorError("SPONSOR_KMS_REQUIRED", KMS_REQUIRED_MESSAGE);
}

/**
 * Firmante de ejemplo que SIEMPRE falla. `feePayer` vacío es intencional:
 * el orquestador lo rechaza con `SPONSOR_KEY_MISMATCH` antes de intentar
 * firmar. Nunca contiene material de clave.
 */
export const KMS_REQUIRED_SPONSOR: SponsorKms = Object.freeze({
  feePayer: "",
  async signFeePayer(input: SponsorSignInput): Promise<SponsorSignOutput> {
    void input;
    return requireSponsorKms();
  },
});
