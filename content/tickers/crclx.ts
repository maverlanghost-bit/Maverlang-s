import type { TickerAbout } from "./types";

export const about = {
  symbol: "CRCLx",
  es: "Circle es una empresa de pagos digitales.",
  en: "Circle is a digital payments company.",
} as const satisfies TickerAbout;
