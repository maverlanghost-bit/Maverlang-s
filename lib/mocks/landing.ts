import { ENABLED_TICKERS } from "@/config/tickers";

/**
 * Cifras estáticas para la landing. No son cotizaciones ni volumen.
 * La UI debe mostrarlas como "Precios ilustrativos".
 */
export const ILLUSTRATIVE_NOTICE = "Precios ilustrativos";

export type LandingQuote = {
  symbol: string;
  underlying: string;
  name: string;
  /** Ruta en `public`, desde `config/tickers.ts`. Vacío si no hay archivo. */
  logo: string;
  href: string;
  priceUsd: number;
  /** Ratio, igual que ChangeBadge: 0.012 = +1,20 %. */
  change: number;
  sparkline: number[];
};

const ILLUSTRATIVE_PRICES: Record<string, { priceUsd: number; change: number }> = {
  AAPLx: { priceUsd: 228.4, change: 0.0124 },
  NVDAx: { priceUsd: 131.15, change: 0.0208 },
  TSLAx: { priceUsd: 248.9, change: -0.0086 },
  SPYx: { priceUsd: 572.3, change: 0.0031 },
  QQQx: { priceUsd: 495.6, change: 0.0067 },
  GOOGLx: { priceUsd: 172.8, change: -0.0024 },
  MSFTx: { priceUsd: 428.1, change: 0.0042 },
  AMZNx: { priceUsd: 198.45, change: 0.0091 },
  METAx: { priceUsd: 582.2, change: 0.0112 },
  CRCLx: { priceUsd: 148, change: -0.015 },
};

const HERO_SYMBOLS = new Set(["AAPLx", "NVDAx", "TSLAx", "MSFTx"]);

/** Serie corta que termina en el precio mostrado. No es historia de mercado. */
function illustrativeSeries(priceUsd: number, change: number): number[] {
  const start = priceUsd / (1 + change);
  const span = priceUsd - start;
  const steps = 12;
  const points = Array.from({ length: steps }, (_, index) => {
    const t = index / (steps - 1);
    const wobble = Math.sin(index * 1.4) * Math.abs(span) * 0.18;
    return Math.round((start + span * t + wobble) * 100) / 100;
  });
  const first = points[0];
  const last = points[points.length - 1];
  if (first !== undefined) points[0] = Math.round(start * 100) / 100;
  if (last !== undefined) points[points.length - 1] = priceUsd;
  return points;
}

export const landingQuotes: LandingQuote[] = ENABLED_TICKERS.flatMap((ticker) => {
  const sample = ILLUSTRATIVE_PRICES[ticker.symbol];
  if (!sample) return [];
  return [
    {
      symbol: ticker.symbol,
      underlying: ticker.underlying,
      name: ticker.name,
      logo: ticker.logo,
      href: `/app/accion/${ticker.symbol}`,
      priceUsd: sample.priceUsd,
      change: sample.change,
      sparkline: illustrativeSeries(sample.priceUsd, sample.change),
    },
  ];
});

export const landingHeroQuotes = landingQuotes.filter((quote) => HERO_SYMBOLS.has(quote.symbol));
