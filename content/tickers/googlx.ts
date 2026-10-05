import type { TickerAbout } from "./types";

export const about = {
  symbol: "GOOGLx",
  es: "Alphabet es la empresa de Google. Trabaja en búsqueda, video y servicios en la nube.",
  en: "Alphabet is the company behind Google. It works on search, video, and cloud services.",
} as const satisfies TickerAbout;
