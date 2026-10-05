import type { TickerAbout } from "./types";

export const about = {
  symbol: "TSLAx",
  es: "Tesla fabrica vehículos eléctricos y equipos de energía.",
  en: "Tesla builds electric vehicles and energy equipment.",
} as const satisfies TickerAbout;
