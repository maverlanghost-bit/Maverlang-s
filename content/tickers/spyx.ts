import type { TickerAbout } from "./types";

export const about = {
  symbol: "SPYx",
  es: "SPY es un fondo que busca seguir al S&P 500, un grupo de empresas grandes de Estados Unidos.",
  en: "SPY is a fund that aims to follow the S&P 500, a group of large United States companies.",
} as const satisfies TickerAbout;
