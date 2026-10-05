import type { TickerAbout } from "./types";

export const about = {
  symbol: "HOODx",
  es: "Robinhood es una empresa de inversiones para personas.",
  en: "Robinhood is an investing company for individuals.",
} as const satisfies TickerAbout;
