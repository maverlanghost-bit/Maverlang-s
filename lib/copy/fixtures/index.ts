import "server-only";

import arkk from "./arkk.json";
import berkshireHathaway from "./berkshire-hathaway-13f.json";
import biceAccionesDestacadas from "./bice-acciones-destacadas.json";
import indexJson from "./index.json";
import norgesBank from "./norges-bank-13f.json";
import scion from "./scion-13f.json";
import statusJson from "./status.json";

/**
 * Fixtures de «Copiar carteras» en el formato FINAL v1 de Faro
 * (`docs/FRACCION_FEED_FORMATO.md`): JSON canónico, `version_id` y
 * `detail_sha256` reales sobre los bytes de cada archivo.
 *
 * Todo lleva `example: true`: son ilustrativos, no datos de hoy. Sólo se sirven
 * con `NODE_ENV !== "production"` o a una cuenta demo, y nunca se guardan como
 * snapshot. El índice NO está firmado (`fixture-sin-firma`): la firma Ed25519
 * se verifica únicamente en el feed remoto, con la clave pública del entorno.
 */

export const FIXTURE_INDEX: unknown = indexJson;
export const FIXTURE_STATUS: unknown = statusJson;

export const FIXTURE_DETAILS: Readonly<Record<string, unknown>> = {
  arkk,
  "berkshire-hathaway-13f": berkshireHathaway,
  "bice-acciones-destacadas": biceAccionesDestacadas,
  "norges-bank-13f": norgesBank,
  "scion-13f": scion,
};

export function getFixtureDetail(slug: string): unknown | null {
  if (!Object.prototype.hasOwnProperty.call(FIXTURE_DETAILS, slug)) return null;
  return FIXTURE_DETAILS[slug];
}

export const FIXTURE_SLUGS: readonly string[] = Object.keys(FIXTURE_DETAILS);
