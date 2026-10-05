import type { TickerAbout } from "./types";

export const about = {
  symbol: "NVDAx",
  es: "NVIDIA diseña chips y software para cómputo gráfico e inteligencia artificial.",
  en: "NVIDIA designs chips and software for graphics and artificial intelligence.",
} as const satisfies TickerAbout;
