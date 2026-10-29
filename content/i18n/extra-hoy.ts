import type { Preferences } from "@/lib/types";

/** Textos de "Tu día" en el mercado. Misma forma en es-CL y en. */
export interface HoyCopy {
  title: string;
  clock: string;
  open: string;
  pre: string;
  after: string;
  closed: string;
  openNote: string;
  preNote: string;
  afterNote: string;
  closedNote: string;
  gainers: string;
  losers: string;
  viewed: string;
  lists: string;
  spy: string;
  loading: string;
  empty: string;
  error: string;
  retry: string;
  statusError: string;
  openStock: string;
}

export const hoyExtra: { esCL: HoyCopy; en: HoyCopy } = {
  esCL: {
    title: "Tu día",
    clock: "hora de Chile",
    open: "Abierto",
    pre: "Premercado",
    after: "Tras el cierre",
    closed: "Cerrado",
    openNote: "Horario regular en EE.UU.",
    preNote: "Antes de la apertura en EE.UU.",
    afterNote: "Fuera de horario. El precio puede variar más.",
    closedNote: "La bolsa de EE.UU. está cerrada.",
    gainers: "Más suben",
    losers: "Más bajan",
    viewed: "Más vistos",
    lists: "Listas del día",
    spy: "S&P 500",
    loading: "Cargando el día",
    empty: "Sin variación para mostrar",
    error: "No pudimos cargar el día",
    retry: "Reintentar",
    statusError: "No pudimos ver el horario",
    openStock: "Ver {name}",
  },
  en: {
    title: "Your day",
    clock: "Chile time",
    open: "Open",
    pre: "Pre-market",
    after: "After hours",
    closed: "Closed",
    openNote: "Regular hours in the US.",
    preNote: "Before the US open.",
    afterNote: "Outside regular hours. The price can move more.",
    closedNote: "The US market is closed.",
    gainers: "Top gainers",
    losers: "Top losers",
    viewed: "Most viewed",
    lists: "Today's lists",
    spy: "S&P 500",
    loading: "Loading the day",
    empty: "No move to show",
    error: "We couldn't load the day",
    retry: "Try again",
    statusError: "We couldn't load market hours",
    openStock: "View {name}",
  },
};

export function hoyCopy(language: Preferences["language"]): HoyCopy {
  return language === "en" ? hoyExtra.en : hoyExtra.esCL;
}
