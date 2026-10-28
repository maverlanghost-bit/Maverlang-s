/**
 * Ticker de catálogo → símbolo de Yahoo Finance.
 * Puro: sin red ni `server-only`. `scripts/underlying-prices.mjs` lo importa
 * con `node --experimental-strip-types` (igual que `config/tickers.generated.ts`).
 *
 * Sin MIC, o con un MIC que no está en la tabla (EE.UU.): mayúsculas y `.` → `-`
 * (`BRK.B` → `BRK-B`). Esa forma es la clave de `underlying_prices.underlying`.
 *
 * Con MIC europeo/asiático el ticker del catálogo trae la letra de mercado
 * pegada (Uniform Symbology, en mayúsculas): `ADSD` + XETR → `ADS.DE`.
 * La letra se quita sólo si es la de ese MIC y queda al menos un carácter.
 */

export interface YahooMarket {
  /** Letra pegada al final del ticker local. Vacío si el mercado no la usa. */
  readonly strip: string;
  /** Sufijo de Yahoo, con el punto (`.DE`). */
  readonly suffix: string;
  /** Ceros a la izquierda cuando el ticker, ya sin letra, es numérico. */
  readonly pad?: number;
}

/**
 * MIC → letra a quitar y sufijo Yahoo.
 * La letra es la de Uniform Symbology (en mayúsculas). El sufijo es el de Yahoo,
 * que no coincide con esa letra (`D` → `.DE`, `U` → `.LS`, `Z` → `.SW`).
 */
export const YAHOO_MARKETS: Readonly<Record<string, YahooMarket>> = {
  XETR: { strip: "D", suffix: ".DE" },
  XFRA: { strip: "F", suffix: ".F" },
  XAMS: { strip: "A", suffix: ".AS" },
  XPAR: { strip: "P", suffix: ".PA" },
  XBRU: { strip: "B", suffix: ".BR" },
  XLIS: { strip: "U", suffix: ".LS" },
  XMAD: { strip: "E", suffix: ".MC" },
  XMIL: { strip: "M", suffix: ".MI" },
  XHEL: { strip: "H", suffix: ".HE" },
  XSTO: { strip: "S", suffix: ".ST" },
  XCSE: { strip: "C", suffix: ".CO" },
  XOSL: { strip: "O", suffix: ".OL" },
  XSWX: { strip: "Z", suffix: ".SW" },
  XVTX: { strip: "Z", suffix: ".SW" },
  XLON: { strip: "L", suffix: ".L" },
  XDUB: { strip: "I", suffix: ".IR" },
  XWBO: { strip: "V", suffix: ".VI" },
  XWAR: { strip: "W", suffix: ".WA" },
  XATH: { strip: "Y", suffix: ".AT" },
  XICE: { strip: "R", suffix: ".IC" },
  XBUD: { strip: "T", suffix: ".BD" },
  XJSE: { strip: "J", suffix: ".JO" },
  XHKG: { strip: "", suffix: ".HK", pad: 4 },
  XTKS: { strip: "", suffix: ".T", pad: 4 },
};

/** Símbolo para la URL de Yahoo. Sin MIC queda la clave que ya guarda la app. */
export function toYahooSymbol(underlying: string, exchangeMic?: string | null): string {
  const raw = underlying.trim().toUpperCase();
  if (!raw) return "";
  const mic = exchangeMic?.trim().toUpperCase() ?? "";
  const market = mic ? YAHOO_MARKETS[mic] : undefined;
  let base = raw;
  if (market && market.strip.length > 0 && base.endsWith(market.strip) && base.length > market.strip.length) {
    base = base.slice(0, -market.strip.length);
  }
  if (market?.pad && base.length > 0 && base.length < market.pad && /^\d+$/.test(base)) {
    base = base.padStart(market.pad, "0");
  }
  base = base.replace(/\./g, "-");
  if (!base) return "";
  return market ? `${base}${market.suffix}` : base;
}
