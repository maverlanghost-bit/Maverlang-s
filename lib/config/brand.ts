/**
 * Flags públicos de marca (M45). Seguro en cliente: sin `server-only`,
 * sin `lib/env`, sin nada de servidor (lo vigila `client-imports`).
 *
 * `NEXT_PUBLIC_COMPANY_LOGOS=on|off` (default `on`, no es un secreto):
 * con `off` no se piden las imágenes de `public/logos` y se muestran los
 * monogramas, por si el abogado lo pide. `raw` existe sólo para tests.
 */
export function companyLogosEnabled(raw?: string | null | undefined): boolean {
  const source = raw === undefined || raw === null ? process.env.NEXT_PUBLIC_COMPANY_LOGOS : raw;
  const value = (source ?? "").trim().toLowerCase();
  if (value === "") return true;
  return value !== "off";
}
