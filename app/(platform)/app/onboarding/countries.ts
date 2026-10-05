export type CountryOption = { value: string; label: string };

/**
 * ISO 3166-1 alpha-2 de países y territorios habitados.
 * `Intl.supportedValuesOf("region")` no está en este runtime.
 */
const REGION_CODES =
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW";

const FALLBACK: CountryOption[] = [
  { value: "CL", label: "Chile" },
  { value: "AR", label: "Argentina" },
  { value: "BO", label: "Bolivia" },
  { value: "BR", label: "Brasil" },
  { value: "CO", label: "Colombia" },
  { value: "EC", label: "Ecuador" },
  { value: "ES", label: "España" },
  { value: "MX", label: "México" },
  { value: "PE", label: "Perú" },
  { value: "US", label: "Estados Unidos" },
  { value: "UY", label: "Uruguay" },
];

let cache: CountryOption[] | null = null;

function fromIntl(): CountryOption[] {
  const names = new Intl.DisplayNames(["es-CL"], { type: "region" });
  const rows: CountryOption[] = [];
  for (const code of REGION_CODES.split(" ")) {
    const label = names.of(code);
    if (!label || label.toUpperCase() === code) continue;
    rows.push({ value: code, label });
  }
  rows.sort((a, b) => a.label.localeCompare(b.label, "es"));
  const chile = rows.findIndex((row) => row.value === "CL");
  if (chile > 0) {
    const [row] = rows.splice(chile, 1);
    if (row) rows.unshift(row);
  }
  return rows;
}

/** Chile primero. El resto, en español de Chile. `US` queda en la lista para la pantalla de no disponible. */
export function countryOptions(): CountryOption[] {
  if (cache) return cache;
  try {
    const rows = fromIntl();
    cache = rows.some((row) => row.value === "US") && rows.some((row) => row.value === "CL") ? rows : FALLBACK;
  } catch {
    cache = FALLBACK;
  }
  return cache;
}

export function isResidenceCountry(code: string): boolean {
  return countryOptions().some((option) => option.value === code);
}
