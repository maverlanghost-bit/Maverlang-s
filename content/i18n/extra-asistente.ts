/**
 * Textos del asistente. Misma forma en es-CL y en.
 * No van en es-CL.ts / en.ts: esta parte no edita esos archivos.
 * No es recomendación de inversión.
 */

export type AsistenteSuggestionId = "tesla" | "compare" | "portfolio" | "import";

export type AsistenteSuggestion = {
  id: AsistenteSuggestionId;
  text: string;
};

export type AsistenteRange = "1D" | "1W" | "1M" | "1Y";

export type AsistenteCopy = {
  pageTitle: string;
  lead: string;
  placeholder: string;
  send: string;
  attach: string;
  typing: string;
  disclaimer: string;
  suggestions: readonly AsistenteSuggestion[];
  emptyTitle: string;
  emptyBody: string;
  seed: string;
  notConfigured: string;
  notConfiguredHint: string;
  rateTitle: string;
  rateBody: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  buyCta: string;
  buyNote: string;
  buyMissing: string;
  noPrice: string;
  noChange: string;
  noChart: string;
  noTotal: string;
  noPositions: string;
  portfolioTitle: string;
  compareTitle: string;
  valueLabel: string;
  weightLabel: string;
  photoAlt: string;
  photoCaption: string;
  photoType: string;
  photoBig: string;
  photoFail: string;
  removePhoto: string;
  clear: string;
  transcript: string;
  you: string;
  assistant: string;
  ask: string;
  askAbout: string;
  ready: string;
  network: string;
  ranges: Record<AsistenteRange, string>;
};

const suggestionsEs: readonly AsistenteSuggestion[] = [
  { id: "tesla", text: "¿Cómo va Tesla hoy?" },
  { id: "compare", text: "Compara Apple y Microsoft" },
  { id: "portfolio", text: "¿Cómo va mi cartera?" },
  { id: "import", text: "Importar foto de mi cartera" },
];

const suggestionsEn: readonly AsistenteSuggestion[] = [
  { id: "tesla", text: "How is Tesla today?" },
  { id: "compare", text: "Compare Apple and Microsoft" },
  { id: "portfolio", text: "How is my portfolio?" },
  { id: "import", text: "Import a photo of my portfolio" },
];

export const asistenteCopy: { esCL: AsistenteCopy; en: AsistenteCopy } = {
  esCL: {
    pageTitle: "Asistente",
    lead: "Pregunta por una acción, compara o mira tu cartera.",
    placeholder: "Escribe tu pregunta",
    send: "Enviar",
    attach: "Adjuntar foto",
    typing: "Escribiendo",
    disclaimer: "No es recomendación de inversión",
    suggestions: suggestionsEs,
    emptyTitle: "¿En qué te ayudo?",
    emptyBody: "Elige una idea o escribe tu pregunta.",
    seed: "¿Cómo va {ticker}?",
    notConfigured: "El asistente aún no está configurado",
    notConfiguredHint: "Cuando esté listo, podrás preguntar desde aquí.",
    rateTitle: "Demasiadas preguntas",
    rateBody: "Espera un momento y vuelve a intentar.",
    errorTitle: "No pudimos responder",
    errorBody: "Inténtalo de nuevo en un momento.",
    retry: "Reintentar",
    buyCta: "Ver para comprar",
    buyNote: "Vas a confirmar en la pantalla de compra.",
    buyMissing: "No hay un enlace de compra.",
    noPrice: "Sin precio",
    noChange: "Sin dato",
    noChart: "Sin gráfico",
    noTotal: "Sin total",
    noPositions: "Sin posiciones",
    portfolioTitle: "Tu cartera",
    compareTitle: "Comparación",
    valueLabel: "Valor",
    weightLabel: "Peso",
    photoAlt: "Foto adjunta",
    photoCaption: "Foto de mi cartera",
    photoType: "Usa una foto JPG o PNG.",
    photoBig: "Esa foto es muy pesada.",
    photoFail: "No pudimos leer la foto.",
    removePhoto: "Quitar foto",
    clear: "Nueva conversación",
    transcript: "Conversación",
    you: "Tú",
    assistant: "Asistente",
    ask: "Preguntar a la IA",
    askAbout: "Preguntar a la IA sobre {ticker}",
    ready: "Listo.",
    network: "No pudimos conectar.",
    ranges: { "1D": "1D", "1W": "1S", "1M": "1M", "1Y": "1A" },
  },
  en: {
    pageTitle: "Assistant",
    lead: "Ask about a stock, compare, or check your portfolio.",
    placeholder: "Write your question",
    send: "Send",
    attach: "Attach photo",
    typing: "Writing",
    disclaimer: "Not investment advice",
    suggestions: suggestionsEn,
    emptyTitle: "How can I help?",
    emptyBody: "Pick an idea or write your question.",
    seed: "How is {ticker}?",
    notConfigured: "The assistant is not configured yet",
    notConfiguredHint: "When it is ready, you can ask from here.",
    rateTitle: "Too many questions",
    rateBody: "Wait a moment and try again.",
    errorTitle: "We could not answer",
    errorBody: "Try again in a moment.",
    retry: "Try again",
    buyCta: "View to buy",
    buyNote: "You will confirm on the buy screen.",
    buyMissing: "There is no buy link.",
    noPrice: "No price",
    noChange: "No data",
    noChart: "No chart",
    noTotal: "No total",
    noPositions: "No positions",
    portfolioTitle: "Your portfolio",
    compareTitle: "Comparison",
    valueLabel: "Value",
    weightLabel: "Weight",
    photoAlt: "Attached photo",
    photoCaption: "Photo of my portfolio",
    photoType: "Use a JPG or PNG photo.",
    photoBig: "That photo is too large.",
    photoFail: "We could not read the photo.",
    removePhoto: "Remove photo",
    clear: "New chat",
    transcript: "Conversation",
    you: "You",
    assistant: "Assistant",
    ask: "Ask the AI",
    askAbout: "Ask the AI about {ticker}",
    ready: "Done.",
    network: "We could not connect.",
    ranges: { "1D": "1D", "1W": "1W", "1M": "1M", "1Y": "1Y" },
  },
};

export function asistenteText(language: "es-CL" | "en"): AsistenteCopy {
  return language === "en" ? asistenteCopy.en : asistenteCopy.esCL;
}

export function fillAsistente(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9]+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined ? match : value;
  });
}
