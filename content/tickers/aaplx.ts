import type { TickerAbout } from "./types";

export const about = {
  symbol: "AAPLx",
  es: "Apple diseña teléfonos, computadores y servicios para usar en el día a día.",
  en: "Apple designs phones, computers, and services for everyday use.",
} as const satisfies TickerAbout;
