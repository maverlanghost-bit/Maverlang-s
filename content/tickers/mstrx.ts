import type { TickerAbout } from "./types";

export const about = {
  symbol: "MSTRx",
  es: "Strategy es una empresa de software.",
  en: "Strategy is a software company.",
} as const satisfies TickerAbout;
