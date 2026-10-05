import type { TickerAbout } from "./types";

export const about = {
  symbol: "QQQx",
  es: "QQQ es un fondo que busca seguir al Nasdaq-100, un grupo de empresas grandes de ese mercado.",
  en: "QQQ is a fund that aims to follow the Nasdaq-100, a group of large companies in that market.",
} as const satisfies TickerAbout;
