/**
 * Categorías del catálogo público: sectores derivados de la clasificación SIC
 * que la SEC registra para cada empresa, más selecciones editoriales y una
 * lista por dato publicado (dividendos).
 *
 * Sin datos inventados: el sector sale del perfil de `company-profile.ts`
 * (snapshot de EDGAR). Si la empresa no tiene SIC utilizable se usa la
 * categoría del catálogo curado (`config/tickers.generated.ts`), y si tampoco
 * hay, la ficha queda sin sector. Ninguna categoría afirma popularidad ni
 * rendimiento.
 *
 * De `public-catalog.ts` sólo se importa el tipo: ese módulo es `server-only`
 * y este archivo lo usan también los tests.
 */
import { CURATED_SYMBOLS } from "@/config/curated-symbols";
import { GENERATED_TICKERS } from "@/config/tickers.generated";
import { companyProfile } from "@/lib/seo/company-profile";
import { brandShort } from "@/lib/seo/metadata";
import type { PublicAsset } from "@/lib/seo/public-catalog";

/** Marca corta configurable (`config/site.ts`): el nombre nunca se escribe a mano. */
const BRAND = brandShort();

export type CatalogCategory = {
  slug: string;
  kind: "sector" | "lista";
  name: string;
  title: string;
  description: string;
  intro: string;
  editorial: boolean;
};

/** Bajo este número de activos la categoría es una página fina: no se publica. */
export const MIN_CATEGORY_SIZE = 3;

type SicRange = readonly [number, number];

type SectorDefinition = Omit<CatalogCategory, "editorial"> & {
  kind: "sector";
  /** Los sectores se derivan de la SIC de la SEC: nunca son una selección editorial. */
  editorial?: boolean;
  /** Rangos SIC del sector, ambos inclusive. */
  ranges: readonly SicRange[];
  /** Códigos que otro sector se lleva antes (6798 y 3711–3716). */
  except?: readonly SicRange[];
};

type ListDefinition = CatalogCategory & { kind: "lista" };

const SECTORS: readonly SectorDefinition[] = [
  {
    slug: "tecnologia",
    kind: "sector",
    name: "Tecnología",
    title: "Acciones de tecnología en EE.UU.",
    description:
      `Empresas de software, semiconductores y hardware de Estados Unidos con ficha pública en ${BRAND} y datos públicos de la SEC EDGAR.`,
    intro:
      "Empresas de software, semiconductores, hardware y servicios de tecnología de la información de Estados Unidos. El sector sale de la clasificación SIC que la SEC registra para cada compañía, no de una opinión nuestra.\n\nCada ficha muestra los datos que la SEC publica (ingresos, utilidad, utilidad por acción) cuando están disponibles, con su fuente y fecha. Esta lista no es una recomendación de inversión.",
    ranges: [
      [3570, 3579],
      [3660, 3679],
      [3820, 3829],
      [7370, 7379],
    ],
  },
  {
    slug: "salud",
    kind: "sector",
    name: "Salud",
    title: "Acciones de salud en EE.UU.",
    description:
      "Farmacéuticas, biotecnológicas, equipos médicos y aseguradoras de salud de Estados Unidos, con ficha pública y datos de la SEC EDGAR.",
    intro:
      "Farmacéuticas, biotecnológicas, equipos médicos y servicios de salud de Estados Unidos. El sector sale de la clasificación SIC de la SEC: agrupa a empresas del mismo rubro, no a las que tuvieron mejor desempeño.\n\nCada enlace abre la ficha del token con los datos de la empresa que la SEC publica, cuando están disponibles. No es una recomendación de inversión.",
    ranges: [
      [2833, 2836],
      [3841, 3851],
      [8000, 8099],
    ],
  },
  {
    slug: "finanzas",
    kind: "sector",
    name: "Finanzas",
    title: "Acciones de bancos y finanzas",
    description:
      `Bancos, aseguradoras, gestoras de fondos y empresas de pagos de Estados Unidos, con cifras de la SEC EDGAR y ficha pública en ${BRAND}.`,
    intro:
      "Bancos, aseguradoras, gestoras de fondos y empresas de pagos de Estados Unidos. El sector sale de la clasificación SIC de la SEC y no mide tamaño ni resultados.\n\nLas fichas muestran las cifras que la SEC publica cuando existen, con fuente y fecha. No es una recomendación de inversión.",
    ranges: [[6000, 6799]],
    except: [[6798, 6798]],
  },
  {
    slug: "inmobiliario",
    kind: "sector",
    name: "Inmobiliario",
    title: "Acciones inmobiliarias en EE.UU.",
    description:
      `Fideicomisos inmobiliarios (REIT) y empresas ligadas a bienes raíces de Estados Unidos, con datos de la SEC EDGAR y ficha pública en ${BRAND}.`,
    intro:
      "Fideicomisos de inversión inmobiliaria (REIT) y empresas ligadas a bienes raíces de Estados Unidos. La SEC clasifica este grupo en el código SIC 6798, que aquí se separa de las finanzas para que la lista sea más clara.\n\nLos datos de cada ficha vienen de la SEC cuando están disponibles. No es una recomendación de inversión.",
    ranges: [[6798, 6798]],
  },
  {
    slug: "energia",
    kind: "sector",
    name: "Energía",
    title: "Acciones de energía en EE.UU.",
    description:
      `Petroleras, gasíferas y empresas de servicios energéticos de Estados Unidos, con cifras de la SEC EDGAR y ficha pública en ${BRAND}.`,
    intro:
      "Petroleras, gasíferas y empresas de servicios energéticos de Estados Unidos. El sector sale de la clasificación SIC de la SEC: agrupa por rubro, no por precio ni por rentabilidad.\n\nCada ficha muestra las cifras que la SEC publica cuando existen, con fuente y fecha. No es una recomendación de inversión.",
    ranges: [
      [1300, 1399],
      [2900, 2999],
      [4900, 4999],
    ],
  },
  {
    slug: "consumo",
    kind: "sector",
    name: "Consumo",
    title: "Acciones de consumo en EE.UU.",
    description:
      `Comercio minorista, alimentos, autos y marcas de consumo de Estados Unidos, con datos de la SEC EDGAR y ficha pública en ${BRAND}.`,
    intro:
      "Comercio, alimentos, autos y marcas de consumo de Estados Unidos. El sector sale de la clasificación SIC de la SEC; incluye a los fabricantes de autos, que en otros criterios aparecen como industria.\n\nLas fichas muestran los datos de la SEC cuando están disponibles. No es una recomendación de inversión.",
    ranges: [
      [2000, 2399],
      [3711, 3716],
      [5000, 5999],
      [7000, 7299],
      [7900, 7999],
    ],
  },
  {
    slug: "industria",
    kind: "sector",
    name: "Industria",
    title: "Acciones industriales en EE.UU.",
    description:
      `Maquinaria, transporte, defensa y servicios industriales de Estados Unidos, con cifras de la SEC EDGAR y ficha pública en ${BRAND}.`,
    intro:
      "Maquinaria, transporte, defensa y servicios industriales de Estados Unidos. El sector sale de la clasificación SIC de la SEC y deja fuera a los fabricantes de autos, que están en Consumo.\n\nCada ficha muestra las cifras que la SEC publica cuando existen, con fuente y fecha. No es una recomendación de inversión.",
    ranges: [
      [3400, 3569],
      [3580, 3659],
      [3700, 3799],
      [4000, 4799],
    ],
    except: [[3711, 3716]],
  },
  {
    slug: "comunicaciones",
    kind: "sector",
    name: "Comunicaciones",
    title: "Acciones de medios y telecom",
    description:
      `Telecomunicaciones, medios, publicidad y entretenimiento de Estados Unidos, con datos de la SEC EDGAR y ficha pública en ${BRAND}.`,
    intro:
      "Telecomunicaciones, medios y entretenimiento de Estados Unidos. El sector sale de la clasificación SIC de la SEC: agrupa por rubro y no ordena por tamaño ni por resultados.\n\nLos datos de cada ficha vienen de la SEC cuando están disponibles. No es una recomendación de inversión.",
    ranges: [
      [4800, 4899],
      [2710, 2799],
      [7810, 7899],
    ],
  },
  {
    slug: "materiales",
    kind: "sector",
    name: "Materiales",
    title: "Acciones de materiales en EE.UU.",
    description:
      `Minería, químicos, acero y otros materiales básicos de Estados Unidos, con cifras de la SEC EDGAR y ficha pública en ${BRAND}.`,
    intro:
      "Minería, químicos, acero y materiales básicos de Estados Unidos. El sector sale de la clasificación SIC de la SEC; agrupa por rubro, no por desempeño.\n\nCada ficha muestra las cifras que la SEC publica cuando existen, con fuente y fecha. No es una recomendación de inversión.",
    ranges: [
      [1000, 1299],
      [1400, 1499],
      [2800, 2829],
      [2840, 2899],
      [3300, 3399],
    ],
  },
  {
    slug: "etf",
    kind: "sector",
    name: "ETF",
    title: "ETF de EE.UU. como fracciones",
    description:
      `Fondos cotizados (ETF) de Estados Unidos que siguen índices, sectores o materias primas, con datos de la SEC y ficha pública en ${BRAND}.`,
    intro:
      "Fondos cotizados (ETF) de Estados Unidos que siguen índices, sectores o materias primas. Se agrupan aquí porque son fondos y no una sola empresa; cuando la SEC publica el N-PORT, la ficha muestra el patrimonio del fondo y sus mayores posiciones.\n\nComprar la fracción de un ETF no es lo mismo que comprar una acción: no hay voto ni derechos de accionista sobre las empresas del fondo. No es una recomendación de inversión.",
    ranges: [],
  },
];

const LISTS: readonly ListDefinition[] = [
  {
    slug: "inteligencia-artificial",
    kind: "lista",
    name: "Inteligencia artificial",
    title: "Acciones de inteligencia artificial",
    description:
      `Selección editorial de ${BRAND} con empresas de semiconductores, software e infraestructura ligadas a la inteligencia artificial.`,
    intro:
      `Empresas que fabrican chips, software o infraestructura que suele asociarse a la inteligencia artificial. La lista es una selección editorial de ${BRAND}: no mide popularidad, no ordena por rendimiento y no es una recomendación.\n\nSólo aparecen las compañías que están en el catálogo y tienen ficha pública. Los datos de cada ficha vienen de la SEC cuando están disponibles.`,
    editorial: true,
  },
  {
    slug: "cripto-y-blockchain",
    kind: "lista",
    name: "Cripto y blockchain",
    title: "Acciones ligadas a cripto y blockchain",
    description:
      `Selección editorial de ${BRAND} con empresas de Estados Unidos ligadas a bitcoin, exchanges y servicios de blockchain. No incluye criptomonedas.`,
    intro:
      `Empresas de Estados Unidos ligadas a bitcoin, exchanges y servicios de blockchain. La lista es una selección editorial de ${BRAND}: agrupa por tema y no afirma que sean mejores que otras ni que vayan a subir.\n\nNo incluye criptomonedas: cada enlace abre la ficha de una acción tokenizada. Los datos vienen de la SEC cuando están disponibles.`,
    editorial: true,
  },
  {
    slug: "favoritas-de-chile",
    kind: "lista",
    name: "Favoritas de Chile",
    title: "Las favoritas de Chile",
    description:
      `Selección editorial de las empresas de EE.UU. más conocidas: los nombres que destaca la lista curada de ${BRAND}, con datos de la SEC EDGAR.`,
    intro:
      `Las empresas de Estados Unidos más conocidas, según la selección editorial de ${BRAND} que coincide con la lista curada del catálogo. No es un ranking de popularidad ni de rendimiento, y no es una recomendación.\n\nSólo aparecen los nombres que están hoy en el catálogo y tienen ficha pública. Los datos de cada ficha vienen de la SEC cuando están disponibles.`,
    editorial: true,
  },
  {
    slug: "dividendos",
    kind: "lista",
    name: "Dividendos",
    title: "Acciones que pagan dividendos",
    description:
      "Empresas del catálogo que declararon dividendos por acción en los últimos doce meses según la SEC EDGAR. Dato informativo, no asegura pagos futuros.",
    intro:
      "Empresas del catálogo que declararon dividendos por acción mayores que cero en los últimos doce meses, según los datos de la SEC EDGAR. La lista sale de un dato publicado, no de una opinión nuestra.\n\nUn dividendo pasado no asegura pagos futuros. No es una recomendación de inversión.",
    editorial: false,
  },
];

export const CATEGORIES: readonly CatalogCategory[] = [
  ...SECTORS.map((sector) => ({ ...sector, editorial: false })),
  ...LISTS,
];

const BY_SLUG: ReadonlyMap<string, CatalogCategory> = new Map(
  CATEGORIES.map((category) => [category.slug, category] as const),
);

/** Listas por ticker: el orden declarado es editorial y se respeta al listar. */
const AI_TICKERS: readonly string[] = [
  "NVDA",
  "MSFT",
  "GOOGL",
  "GOOG",
  "META",
  "AMD",
  "AVGO",
  "PLTR",
  "TSM",
  "ORCL",
  "AMZN",
  "ARM",
  "MU",
  "ASML",
  "IBM",
  "DELL",
  "SMCI",
  "CRWD",
  "SNOW",
];

const CRYPTO_TICKERS: readonly string[] = ["COIN", "MSTR", "HOOD", "CRCL", "MARA", "RIOT", "GLXY", "BLSH"];

const AI_ORDER: ReadonlyMap<string, number> = new Map(AI_TICKERS.map((ticker, index) => [ticker, index] as const));
const CRYPTO_ORDER: ReadonlyMap<string, number> = new Map(
  CRYPTO_TICKERS.map((ticker, index) => [ticker, index] as const),
);

/** `AAPLx` / `BRK.Bx` / `Fon` → `AAPL` / `BRK-B` / `F`. */
function tokenTicker(symbol: string): string {
  return normalizeTicker(symbol.trim().replace(/(?:on|x)$/i, ""));
}

/** Clave del catálogo: mayúsculas y `.` → `-` (`BRK.B` y `BRK-B` dan `BRK-B`). */
function normalizeTicker(value: string): string {
  return value.trim().toUpperCase().replace(/\./g, "-");
}

const CURATED_SYMBOL_SET: ReadonlySet<string> = new Set(
  CURATED_SYMBOLS.map((entry) => entry.symbol.trim().toUpperCase()),
);
const CURATED_TICKER_SET: ReadonlySet<string> = new Set(CURATED_SYMBOLS.map((entry) => tokenTicker(entry.symbol)));
/** Posición en la lista curada: sirve para el orden estable de `similarAssets`. */
const CURATED_ORDER: ReadonlyMap<string, number> = new Map(
  CURATED_SYMBOLS.map((entry, index) => [tokenTicker(entry.symbol), index] as const),
);

/** Categoría del catálogo curado, sólo como respaldo cuando no hay SIC utilizable. */
const CATEGORY_BY_TICKER: ReadonlyMap<string, string> = new Map(
  GENERATED_TICKERS.map((ticker) => [normalizeTicker(ticker.underlying), ticker.category] as const),
);

const CATEGORY_TO_SECTOR: Readonly<Record<string, string | undefined>> = {
  tech: "tecnologia",
  fintech: "finanzas",
  finance: "finanzas",
  health: "salud",
  energy: "energia",
  consumer: "consumo",
  industrial: "industria",
  commodity: "materiales",
  etf: "etf",
};

function inRanges(code: number, ranges: readonly SicRange[]): boolean {
  for (const [from, to] of ranges) {
    if (code >= from && code <= to) return true;
  }
  return false;
}

/** Código SIC de cuatro dígitos, o null si el perfil no trae uno válido. */
function sicNumber(value: string | null): number | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 3 || digits.length > 4) return null;
  const code = Number(digits);
  return Number.isFinite(code) && code > 0 ? code : null;
}

function sectorBySic(code: number): string | null {
  for (const sector of SECTORS) {
    if (sector.except && inRanges(code, sector.except)) continue;
    if (inRanges(code, sector.ranges)) return sector.slug;
  }
  return null;
}

function isCurated(asset: PublicAsset): boolean {
  if (CURATED_SYMBOL_SET.has(asset.symbol.trim().toUpperCase())) return true;
  return CURATED_TICKER_SET.has(normalizeTicker(asset.ticker));
}

function hasDividend(asset: PublicAsset): boolean {
  const profile = companyProfile(asset.ticker);
  return profile !== null && profile.dividendsPerShareTtm !== null && profile.dividendsPerShareTtm > 0;
}

function matchesList(slug: string, asset: PublicAsset): boolean {
  if (slug === "favoritas-de-chile") return isCurated(asset);
  if (slug === "inteligencia-artificial") return AI_ORDER.has(normalizeTicker(asset.ticker));
  if (slug === "cripto-y-blockchain") return CRYPTO_ORDER.has(normalizeTicker(asset.ticker));
  if (slug === "dividendos") return hasDividend(asset);
  return false;
}

/**
 * Slug del sector del activo, o null si no se puede derivar.
 * Orden: ETF/fondo, SIC de la SEC, y la categoría del catálogo curado como
 * respaldo cuando la empresa no tiene SIC (o el SIC no cae en ningún rango).
 */
function sectorSlugOf(asset: PublicAsset): string | null {
  if (asset.etf) return "etf";
  const profile = companyProfile(asset.ticker);
  if (profile?.kind === "fund") return "etf";
  const code = sicNumber(profile?.sic ?? null);
  if (code !== null) {
    const bySic = sectorBySic(code);
    if (bySic) return bySic;
  }
  const fallback = CATEGORY_BY_TICKER.get(normalizeTicker(asset.ticker));
  if (!fallback) return null;
  return CATEGORY_TO_SECTOR[fallback] ?? null;
}

/** Orden estable: primero los curados (en su orden), después por nombre. */
function compareCuratedThenName(a: PublicAsset, b: PublicAsset): number {
  const rankA = CURATED_ORDER.get(normalizeTicker(a.ticker)) ?? Number.POSITIVE_INFINITY;
  const rankB = CURATED_ORDER.get(normalizeTicker(b.ticker)) ?? Number.POSITIVE_INFINITY;
  if (rankA !== rankB) return rankA - rankB;
  return (
    a.name.localeCompare(b.name, "es", { sensitivity: "base" }) ||
    normalizeTicker(a.ticker).localeCompare(normalizeTicker(b.ticker))
  );
}

/** Sector del activo según el SIC de la SEC (o el respaldo del catálogo). */
export function sectorFor(asset: PublicAsset): CatalogCategory | null {
  const slug = sectorSlugOf(asset);
  if (!slug) return null;
  return BY_SLUG.get(slug) ?? null;
}

/** Sector y listas a las que pertenece el activo, en ese orden. */
export function categoriesFor(asset: PublicAsset): CatalogCategory[] {
  const result: CatalogCategory[] = [];
  const sector = sectorFor(asset);
  if (sector) result.push(sector);
  for (const list of LISTS) {
    if (matchesList(list.slug, asset)) result.push(list);
  }
  return result;
}

/**
 * Activos de una categoría. Sólo cuentan los que están en `assets` (el
 * catálogo público): la categoría nunca inventa fichas. Las listas por ticker
 * respetan el orden editorial; el resto va curados primero y luego por nombre.
 */
export function assetsInCategory(slug: string, assets: readonly PublicAsset[]): PublicAsset[] {
  const category = BY_SLUG.get(slug.trim().toLowerCase());
  if (!category) return [];
  const members = assets.filter((asset) =>
    category.kind === "sector" ? sectorFor(asset)?.slug === category.slug : matchesList(category.slug, asset),
  );
  const order = category.slug === "inteligencia-artificial" ? AI_ORDER : category.slug === "cripto-y-blockchain" ? CRYPTO_ORDER : null;
  if (!order) return members.sort(compareCuratedThenName);
  return members.sort(
    (a, b) =>
      (order.get(normalizeTicker(a.ticker)) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(normalizeTicker(b.ticker)) ?? Number.MAX_SAFE_INTEGER),
  );
}

/** Otras fichas del mismo sector: curadas primero, luego por nombre, sin la propia. */
export function similarAssets(
  asset: PublicAsset,
  assets: readonly PublicAsset[],
  limit = 6,
): PublicAsset[] {
  const sector = sectorFor(asset);
  if (!sector) return [];
  const self = normalizeTicker(asset.ticker);
  const max = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 6;
  return assets
    .filter((item) => normalizeTicker(item.ticker) !== self && sectorFor(item)?.slug === sector.slug)
    .sort(compareCuratedThenName)
    .slice(0, max);
}

/**
 * Pares sugeridos del comparador (tickers). Las páginas usan sólo los pares
 * cuyos dos tickers existen en el catálogo público.
 */
export const COMPARE_PAIRS: readonly (readonly [string, string])[] = [
  ["AAPL", "MSFT"],
  ["NVDA", "AMD"],
  ["GOOGL", "META"],
  ["AMZN", "WMT"],
  ["TSLA", "F"],
  ["KO", "PEP"],
  ["V", "MA"],
  ["SPY", "QQQ"],
  ["JPM", "BAC"],
  ["NFLX", "DIS"],
];

/** Ruta canónica del comparador para dos fichas. */
export function comparePath(a: PublicAsset, b: PublicAsset): string {
  return `/comparar/${a.slug}-vs-${b.slug}`;
}
