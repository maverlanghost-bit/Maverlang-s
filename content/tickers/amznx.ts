import type { TickerAbout } from "./types";

export const about = {
  symbol: "AMZNx",
  es: "Amazon opera una tienda en línea y servicios de computación en la nube.",
  en: "Amazon runs an online store and cloud computing services.",
} as const satisfies TickerAbout;
