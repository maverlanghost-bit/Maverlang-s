import type { TickerAbout } from "./types";

export const about = {
  symbol: "METAx",
  es: "Meta hace redes sociales y aplicaciones de mensajería.",
  en: "Meta makes social networks and messaging apps.",
} as const satisfies TickerAbout;
