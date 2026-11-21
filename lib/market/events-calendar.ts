import { GENERATED_TICKERS } from "@/config/tickers.generated";

export type MarketEventType = "earnings" | "dividend_multiplier" | "macro";

export type EventsCalendarScope = "portfolio" | "favorites" | "all";

export interface MarketEvent {
  id: string;
  /** Fecha ISO YYYY-MM-DD (referencial). */
  date: string;
  type: MarketEventType;
  /** Símbolo xStocks de GENERATED_TICKERS, o null para eventos macro. */
  symbol: string | null;
  /** Nombre legible de la empresa o evento macro. */
  name: string;
  titleEs: string;
  titleEn: string;
  detailEs: string;
  detailEn: string;
  estimated: boolean;
}

interface EventSeed {
  id: string;
  date: string;
  type: MarketEventType;
  symbol: string | null;
  titleEs: string;
  titleEn: string;
  detailEs: string;
  detailEn: string;
  estimated?: boolean;
}

const TICKER_NAME_BY_SYMBOL = new Map<string, string>(
  GENERATED_TICKERS.filter((t) => t.enabled).map((t) => [t.symbol, t.name]),
);

const EVENT_SEEDS: readonly EventSeed[] = [
  // Noviembre - Diciembre 2026
  {
    id: "nvda-q3-2026-earnings",
    date: "2026-11-19",
    type: "earnings",
    symbol: "NVDAx",
    titleEs: "Resultados trimestrales Q3 FY27",
    titleEn: "Q3 FY27 quarterly earnings",
    detailEs: "Reporte de ingresos de centros de datos y guía trimestral tras el cierre de EE.UU.",
    detailEn: "Data center revenue report and quarterly guidance after US market close.",
    estimated: true,
  },
  {
    id: "wmt-q3-2026-earnings",
    date: "2026-11-19",
    type: "earnings",
    symbol: "WMTx",
    titleEs: "Resultados trimestrales Q3 FY27",
    titleEn: "Q3 FY27 quarterly earnings",
    detailEs: "Publicación antes de la apertura de Wall Street.",
    detailEn: "Released before Wall Street market open.",
    estimated: true,
  },
  {
    id: "ko-div-2026-11",
    date: "2026-11-30",
    type: "dividend_multiplier",
    symbol: "KOx",
    titleEs: "Ventana ex-dividendo / ajuste de multiplicador",
    titleEn: "Ex-dividend / multiplier adjustment window",
    detailEs: "En xStocks los dividendos se reflejan ajustando el multiplicador del token.",
    detailEn: "On xStocks, dividends are reflected by adjusting the token multiplier.",
    estimated: true,
  },
  {
    id: "crm-q3-2026-earnings",
    date: "2026-12-02",
    type: "earnings",
    symbol: "CRMx",
    titleEs: "Resultados trimestrales Q3 FY27",
    titleEn: "Q3 FY27 quarterly earnings",
    detailEs: "Margen operativo y crecimiento de suscripciones tras el cierre.",
    detailEn: "Operating margin and subscription growth after market close.",
    estimated: true,
  },
  {
    id: "pep-div-2026-12",
    date: "2026-12-04",
    type: "dividend_multiplier",
    symbol: "PEPx",
    titleEs: "Ventana ex-dividendo / ajuste de multiplicador",
    titleEn: "Ex-dividend / multiplier adjustment window",
    detailEs: "Ajuste automático en el multiplicador xStocks equivalente al dividendo neto.",
    detailEn: "Automatic xStocks multiplier adjustment equivalent to net dividend.",
    estimated: true,
  },
  {
    id: "macro-cpi-2026-12",
    date: "2026-12-10",
    type: "macro",
    symbol: null,
    titleEs: "IPC de EE.UU. (CPI)",
    titleEn: "US CPI inflation report",
    detailEs: "Dato mensual de inflación de EE.UU.; suele generar volatilidad en apertura.",
    detailEn: "Monthly US inflation print; often drives market open volatility.",
    estimated: false,
  },
  {
    id: "avgo-q4-2026-earnings",
    date: "2026-12-10",
    type: "earnings",
    symbol: "AVGOx",
    titleEs: "Resultados trimestrales Q4 FY26",
    titleEn: "Q4 FY26 quarterly earnings",
    detailEs: "Reporte de semiconductores IA y software empresarial tras el cierre.",
    detailEn: "AI semiconductor and enterprise software report after close.",
    estimated: true,
  },
  {
    id: "orcl-q2-2026-earnings",
    date: "2026-12-14",
    type: "earnings",
    symbol: "ORCLx",
    titleEs: "Resultados trimestrales Q2 FY27",
    titleEn: "Q2 FY27 quarterly earnings",
    detailEs: "Ingresos de infraestructura cloud y cartera de contratos.",
    detailEn: "Cloud infrastructure revenue and remaining performance obligations.",
    estimated: true,
  },
  {
    id: "macro-fomc-2026-12",
    date: "2026-12-16",
    type: "macro",
    symbol: null,
    titleEs: "Decisión de tasas Fed (FOMC)",
    titleEn: "Fed rate decision (FOMC)",
    detailEs: "Comunicado de política monetaria y proyecciones económicas a las 14:00 ET.",
    detailEn: "Monetary policy statement and economic projections at 14:00 ET.",
    estimated: false,
  },
  {
    id: "spy-div-2026-12",
    date: "2026-12-18",
    type: "dividend_multiplier",
    symbol: "SPYx",
    titleEs: "Distribución trimestral / ajuste de multiplicador",
    titleEn: "Quarterly distribution / multiplier adjustment",
    detailEs: "Ventana de distribución del ETF S&P 500 reflejada en el multiplicador xStocks.",
    detailEn: "S&P 500 ETF distribution window reflected in the xStocks multiplier.",
    estimated: true,
  },
  {
    id: "qqq-div-2026-12",
    date: "2026-12-21",
    type: "dividend_multiplier",
    symbol: "QQQx",
    titleEs: "Distribución trimestral / ajuste de multiplicador",
    titleEn: "Quarterly distribution / multiplier adjustment",
    detailEs: "Ventana de distribución del ETF Nasdaq-100 reflejada en el multiplicador.",
    detailEn: "Nasdaq-100 ETF distribution window reflected in the multiplier.",
    estimated: true,
  },
  // Enero - Marzo 2027
  {
    id: "macro-cpi-2027-01",
    date: "2027-01-13",
    type: "macro",
    symbol: null,
    titleEs: "IPC de EE.UU. (CPI)",
    titleEn: "US CPI inflation report",
    detailEs: "Lectura mensual de inflación al consumidor en EE.UU.",
    detailEn: "Monthly US consumer price inflation reading.",
    estimated: true,
  },
  {
    id: "tsm-q4-2026-earnings",
    date: "2027-01-14",
    type: "earnings",
    symbol: "TSMx",
    titleEs: "Resultados trimestrales Q4 2026",
    titleEn: "Q4 2026 quarterly earnings",
    detailEs: "Márgenes y plan de inversión (CapEx) en nodos avanzados.",
    detailEn: "Margins and advanced node CapEx outlook.",
    estimated: true,
  },
  {
    id: "bac-q4-2026-earnings",
    date: "2027-01-15",
    type: "earnings",
    symbol: "BACx",
    titleEs: "Resultados trimestrales Q4 2026",
    titleEn: "Q4 2026 quarterly earnings",
    detailEs: "Margen neto de intereses y calidad crediticia antes de apertura.",
    detailEn: "Net interest income and credit quality before market open.",
    estimated: true,
  },
  {
    id: "gs-q4-2026-earnings",
    date: "2027-01-15",
    type: "earnings",
    symbol: "GSx",
    titleEs: "Resultados trimestrales Q4 2026",
    titleEn: "Q4 2026 quarterly earnings",
    detailEs: "Banca de inversión, trading y gestión de activos.",
    detailEn: "Investment banking, trading, and asset management results.",
    estimated: true,
  },
  {
    id: "nflx-q4-2026-earnings",
    date: "2027-01-21",
    type: "earnings",
    symbol: "NFLXx",
    titleEs: "Resultados trimestrales Q4 2026",
    titleEn: "Q4 2026 quarterly earnings",
    detailEs: "Ingresos, margen operativo y suscriptores tras el cierre.",
    detailEn: "Revenue, operating margin, and membership update after close.",
    estimated: true,
  },
  {
    id: "macro-fomc-2027-01",
    date: "2027-01-27",
    type: "macro",
    symbol: null,
    titleEs: "Decisión de tasas Fed (FOMC)",
    titleEn: "Fed rate decision (FOMC)",
    detailEs: "Primera reunión de política monetaria del año de la Reserva Federal.",
    detailEn: "First Federal Reserve monetary policy meeting of the year.",
    estimated: true,
  },
  {
    id: "msft-q2-2027-earnings",
    date: "2027-01-27",
    type: "earnings",
    symbol: "MSFTx",
    titleEs: "Resultados trimestrales Q2 FY27",
    titleEn: "Q2 FY27 quarterly earnings",
    detailEs: "Crecimiento de Azure y adopción de IA empresarial tras el cierre.",
    detailEn: "Azure growth and enterprise AI adoption after close.",
    estimated: true,
  },
  {
    id: "meta-q4-2026-earnings",
    date: "2027-01-28",
    type: "earnings",
    symbol: "METAx",
    titleEs: "Resultados trimestrales Q4 2026",
    titleEn: "Q4 2026 quarterly earnings",
    detailEs: "Ingresos publicitarios y guía de CapEx para 2027.",
    detailEn: "Ad revenue and 2027 CapEx guidance.",
    estimated: true,
  },
  {
    id: "tsla-q4-2026-earnings",
    date: "2027-01-28",
    type: "earnings",
    symbol: "TSLAx",
    titleEs: "Resultados trimestrales Q4 2026",
    titleEn: "Q4 2026 quarterly earnings",
    detailEs: "Márgenes automotrices, energía y actualizaciones de producto.",
    detailEn: "Automotive margins, energy storage, and product updates.",
    estimated: true,
  },
  {
    id: "aapl-q1-2027-earnings",
    date: "2027-01-29",
    type: "earnings",
    symbol: "AAPLx",
    titleEs: "Resultados trimestrales Q1 FY27",
    titleEn: "Q1 FY27 quarterly earnings",
    detailEs: "Temporada navideña de iPhone y crecimiento en Servicios.",
    detailEn: "Holiday iPhone quarter and Services revenue growth.",
    estimated: true,
  },
  {
    id: "googl-q4-2026-earnings",
    date: "2027-02-03",
    type: "earnings",
    symbol: "GOOGLx",
    titleEs: "Resultados trimestrales Q4 2026",
    titleEn: "Q4 2026 quarterly earnings",
    detailEs: "Búsqueda, YouTube y rentabilidad de Google Cloud.",
    detailEn: "Search, YouTube, and Google Cloud profitability.",
    estimated: true,
  },
  {
    id: "amzn-q4-2026-earnings",
    date: "2027-02-04",
    type: "earnings",
    symbol: "AMZNx",
    titleEs: "Resultados trimestrales Q4 2026",
    titleEn: "Q4 2026 quarterly earnings",
    detailEs: "Ventas minoristas, publicidad y AWS tras el cierre.",
    detailEn: "Retail sales, advertising, and AWS after market close.",
    estimated: true,
  },
  {
    id: "lly-q4-2026-earnings",
    date: "2027-02-05",
    type: "earnings",
    symbol: "LLYx",
    titleEs: "Resultados trimestrales Q4 2026",
    titleEn: "Q4 2026 quarterly earnings",
    detailEs: "Ventas de cartera metabólica y guía anual 2027.",
    detailEn: "Metabolic portfolio sales and full-year 2027 guidance.",
    estimated: true,
  },
  {
    id: "aapl-div-2027-02",
    date: "2027-02-09",
    type: "dividend_multiplier",
    symbol: "AAPLx",
    titleEs: "Ventana ex-dividendo / ajuste de multiplicador",
    titleEn: "Ex-dividend / multiplier adjustment window",
    detailEs: "Ajuste trimestral del multiplicador xStocks equivalente al dividendo.",
    detailEn: "Quarterly xStocks multiplier adjustment equivalent to dividend.",
    estimated: true,
  },
  {
    id: "xom-div-2027-02",
    date: "2027-02-12",
    type: "dividend_multiplier",
    symbol: "XOMx",
    titleEs: "Ventana ex-dividendo / ajuste de multiplicador",
    titleEn: "Ex-dividend / multiplier adjustment window",
    detailEs: "Ajuste del multiplicador xStocks por dividendo trimestral.",
    detailEn: "xStocks multiplier adjustment for quarterly dividend.",
    estimated: true,
  },
  {
    id: "msft-div-2027-02",
    date: "2027-02-18",
    type: "dividend_multiplier",
    symbol: "MSFTx",
    titleEs: "Ventana ex-dividendo / ajuste de multiplicador",
    titleEn: "Ex-dividend / multiplier adjustment window",
    detailEs: "Ajuste del multiplicador xStocks por dividendo trimestral.",
    detailEn: "xStocks multiplier adjustment for quarterly dividend.",
    estimated: true,
  },
  {
    id: "nvda-q4-2027-earnings",
    date: "2027-02-24",
    type: "earnings",
    symbol: "NVDAx",
    titleEs: "Resultados trimestrales Q4 FY27",
    titleEn: "Q4 FY27 quarterly earnings",
    detailEs: "Cierre de año fiscal y proyección de demanda de infraestructura IA.",
    detailEn: "Fiscal year-end report and AI infrastructure demand outlook.",
    estimated: true,
  },
];

export const MARKET_EVENTS: readonly MarketEvent[] = EVENT_SEEDS.filter(
  (seed) => seed.symbol === null || TICKER_NAME_BY_SYMBOL.has(seed.symbol),
).map((seed) => ({
  id: seed.id,
  date: seed.date,
  type: seed.type,
  symbol: seed.symbol,
  name: seed.symbol ? (TICKER_NAME_BY_SYMBOL.get(seed.symbol) ?? seed.symbol) : "Macro EE.UU.",
  titleEs: seed.titleEs,
  titleEn: seed.titleEn,
  detailEs: seed.detailEs,
  detailEn: seed.detailEn,
  estimated: seed.estimated ?? true,
}));

function toIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface GetUpcomingEventsOptions {
  symbols?: readonly string[];
  favorites?: readonly string[];
  scope?: EventsCalendarScope;
  now?: Date;
  limit?: number;
}

/**
 * Devuelve eventos próximos ordenados cronológicamente, filtrados por alcance
 * (`portfolio`, `favorites`, `all`). Los eventos macro (`symbol: null`) se
 * incluyen en todos los alcances por su impacto transversal.
 */
export function getUpcomingEvents(options: GetUpcomingEventsOptions = {}): MarketEvent[] {
  const { symbols = [], favorites = [], scope = "all", now = new Date(), limit = 12 } = options;
  const todayIso = toIsoDate(now);

  const portfolioSet = new Set(symbols.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const favoritesSet = new Set(favorites.map((s) => s.trim().toLowerCase()).filter(Boolean));

  const filtered = MARKET_EVENTS.filter((event) => {
    if (event.date < todayIso) return false;
    if (scope === "all" || event.symbol === null) return true;
    const key = event.symbol.toLowerCase();
    if (scope === "portfolio") return portfolioSet.has(key);
    if (scope === "favorites") return favoritesSet.has(key);
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id);
  });

  return limit > 0 ? sorted.slice(0, limit) : sorted;
}
