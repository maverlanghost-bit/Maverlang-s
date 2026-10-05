import type { TickerAbout } from "./types";

export const about = {
  symbol: "MSFTx",
  es: "Microsoft hace software, servicios en la nube y dispositivos.",
  en: "Microsoft makes software, cloud services, and devices.",
} as const satisfies TickerAbout;
