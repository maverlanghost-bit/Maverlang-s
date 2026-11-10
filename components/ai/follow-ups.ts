/**
 * Preguntas de seguimiento del asistente (sólo cliente).
 *
 * Se derivan de los widgets que acompañan la última respuesta y del último
 * mensaje del usuario. Son informativas: nunca sugieren comprar, vender ni
 * invertir, y jamás inventan cifras ni tickers fuera de `config/tickers.ts`.
 * Devuelve como máximo tres preguntas en español de Chile.
 */

import type { AiWidget } from "@/components/ai/contract";
import { tickerBySymbol } from "@/config/tickers";

const MAX_FOLLOW_UPS = 3;

/** Consejo, promesa o proyección: si un texto calza, no se ofrece. */
const ADVICE_PATTERN =
  /deber[íi]a|\bdebo\b|\bconviene\b|recomend|vale la pena|mejor (comprar|vender|invertir)|garantiz|ganar[áa]s|rentabilidad|retorno esperado|asegur\w+/i;

/** Índices con los que se compara; sólo se ofrecen si existen en el catálogo. */
const BENCHMARKS: readonly { ticker: string; label: string }[] = [
  { ticker: "SPYx", label: "el S&P 500 (SPYx)" },
  { ticker: "QQQx", label: "el Nasdaq 100 (QQQx)" },
];

type Candidate = {
  text: string;
  priority: number;
};

type WidgetShape = {
  type?: unknown;
  ticker?: unknown;
  items?: unknown;
};

type WidgetFacts = {
  /** Tickers del catálogo presentes en los widgets, en orden de aparición. */
  tickers: string[];
  /** Tickers que ya traen datos de empresa (no se vuelve a ofrecer). */
  company: string[];
  portfolio: boolean;
  simulation: boolean;
  compare: boolean;
  alert: boolean;
  buy: boolean;
  imported: boolean;
};

/** Los widgets nuevos llegan desde `contract.ts`; se leen por forma y no por tipo. */
function shapeOf(widget: AiWidget): WidgetShape {
  return widget as unknown as WidgetShape;
}

function typeOf(widget: AiWidget): string {
  const type = shapeOf(widget).type;
  return typeof type === "string" ? type : "";
}

/** Normaliza un ticker contra el catálogo; devuelve `null` si no existe. */
function canonicalTicker(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const found = tickerBySymbol(value.trim());
  return found ? found.symbol : null;
}

function pushUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value);
}

function itemTickers(widget: AiWidget): string[] {
  const items = shapeOf(widget).items;
  if (!Array.isArray(items)) return [];

  const tickers: string[] = [];
  for (const item of items) {
    const record = item as { ticker?: unknown } | null;
    const ticker = canonicalTicker(record?.ticker);
    if (ticker) pushUnique(tickers, ticker);
  }
  return tickers;
}

function readFacts(widgets: readonly AiWidget[]): WidgetFacts {
  const facts: WidgetFacts = {
    tickers: [],
    company: [],
    portfolio: false,
    simulation: false,
    compare: false,
    alert: false,
    buy: false,
    imported: false,
  };

  for (const widget of widgets) {
    const type = typeOf(widget);

    if (type === "compare") {
      facts.compare = true;
      for (const ticker of itemTickers(widget)) pushUnique(facts.tickers, ticker);
      continue;
    }

    const ticker = canonicalTicker(shapeOf(widget).ticker);
    if (ticker) pushUnique(facts.tickers, ticker);

    if (type === "company") {
      if (ticker) pushUnique(facts.company, ticker);
    } else if (type === "simulation") {
      facts.simulation = true;
    } else if (type === "portfolio" || type === "portfolio-today") {
      facts.portfolio = true;
    } else if (type === "alert-confirm") {
      facts.alert = true;
    } else if (type === "buy") {
      facts.buy = true;
    } else if (type === "import-preview") {
      facts.imported = true;
    }
  }

  return facts;
}

/** Primer ticker del catálogo escrito en el texto del usuario. */
function tickerFromText(text: string): string | null {
  const matches = text.match(/[A-Za-z]{1,5}x/g);
  if (!matches) return null;

  for (const match of matches) {
    const found = tickerBySymbol(match);
    if (found) return found.symbol;
  }
  return null;
}

function benchmarkFor(ticker: string): { ticker: string; label: string } | null {
  for (const benchmark of BENCHMARKS) {
    if (benchmark.ticker.toLowerCase() === ticker.toLowerCase()) continue;
    if (tickerBySymbol(benchmark.ticker)) return benchmark;
  }
  return null;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLocaleLowerCase("es-CL");
}

/**
 * Devuelve hasta tres preguntas de seguimiento para la última respuesta.
 * Sin widgets ni tickers concretos devuelve `[]`: no se pregunta sólo para
 * alargar la conversación.
 */
export function deriveFollowUps(widgets: AiWidget[], lastUserText: string): string[] {
  const list = Array.isArray(widgets) ? widgets : [];
  const facts = readFacts(list);
  const sourceText = typeof lastUserText === "string" ? lastUserText : "";
  const asked = normalize(sourceText);
  const primary = facts.tickers[0] ?? tickerFromText(sourceText);
  const candidates: Candidate[] = [];
  const add = (text: string, priority: number) => candidates.push({ text, priority });

  // Temas concretos que la respuesta ya dejó sobre la mesa.
  if (facts.simulation) {
    add("¿Cuánto sería con otro aporte mensual?", 10);
    add("¿Qué pasa si cambio el plazo de la simulación?", 11);
  }
  if (facts.portfolio) {
    add("¿Qué tan concentrada está mi cartera?", 10);
    add("¿Cómo se reparte mi cartera por acción?", 11);
  }
  if (facts.alert) add("¿Cómo funcionan las alertas de precio?", 10);
  if (facts.compare) add("¿Cómo se calcula la variación del período?", 12);
  if (facts.buy) add("¿Cómo se ejecuta una compra con USDC?", 12);
  if (facts.imported) add("¿Cómo se revisa una cartera importada?", 12);

  // Pistas del último mensaje: el seguimiento mantiene el hilo de la charla.
  if (/comisi[oó]n|comisiones|costos?|tarifas?/i.test(sourceText)) {
    add("¿Qué comisiones tiene operar en Maverlang?", 15);
  }
  if (/horario|24\s*\/\s*7|bolsa de (ee\.?\s?uu\.?|estados unidos)|mercado cerrado/i.test(sourceText)) {
    add("¿Qué pasa fuera del horario de la bolsa de EE.UU.?", 15);
  }

  if (primary) {
    if (!facts.company.includes(primary)) {
      add(`Ver datos de la empresa de ${primary}`, 20);
    }
    const benchmark = benchmarkFor(primary);
    if (benchmark && !facts.compare) {
      add(`Comparar ${primary} con ${benchmark.label}`, 21);
    }
    add(`¿De qué depende el precio de ${primary}?`, 22);
  }

  const hasConcrete =
    facts.tickers.length > 0 ||
    facts.portfolio ||
    facts.compare ||
    facts.alert ||
    facts.buy ||
    facts.imported;

  if (hasConcrete) {
    add("¿Cómo se calcula el precio en pesos?", 90);
    add("¿Qué comisiones tiene operar en Maverlang?", 91);
    add("¿Dónde quedan guardados mis xStocks?", 92);
    add("¿Qué pasa fuera del horario de la bolsa de EE.UU.?", 93);
  }

  const ordered = candidates.slice().sort((a, b) => a.priority - b.priority);
  const result: string[] = [];
  const seen = new Set<string>();

  for (const candidate of ordered) {
    const text = candidate.text.replace(/\s+/g, " ").trim();
    const key = normalize(text);
    if (!key || seen.has(key) || key === asked) continue;
    if (ADVICE_PATTERN.test(text)) continue;
    seen.add(key);
    result.push(text);
    if (result.length === MAX_FOLLOW_UPS) break;
  }

  return result;
}
