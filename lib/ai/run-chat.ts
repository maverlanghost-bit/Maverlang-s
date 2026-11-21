import "server-only";

import { aiMessages } from "@/content/i18n/extra-b";
import { fold } from "@/lib/market/browse";
import { getServices, historyWithSource } from "@/lib/services";
import type { AiChatRequest, AiWidget } from "@/lib/ai/types";
import { loadPortfolioForAssistant } from "@/lib/ai/portfolio";
import { resolveTicker, searchTickers } from "@/lib/ai/resolve";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { AI_TOOLS, executeToolCall, type AssistantDeps } from "@/lib/ai/tools";
import {
  callXai,
  callXaiStream,
  type XaiContentPart,
  type XaiMessage,
  type XaiToolCallPayload,
} from "@/lib/ai/xai";

const copy = aiMessages.esCL;

/** Tope de idas y vueltas en las que el modelo puede pedir herramientas. */
export const MAX_TOOL_ROUNDS = 4;
const MAX_CALLS_PER_ROUND = 6;

export interface RunChatInput {
  messages: AiChatRequest["messages"];
  image?: string;
  context?: { ticker?: string };
  req: Request;
}

export function defaultAssistantDeps(): AssistantDeps {
  const services = getServices();
  return {
    prices: services.prices,
    historyWithSource,
    loadPortfolio: loadPortfolioForAssistant,
    resolveTicker,
    searchTickers,
  };
}

function widgetKey(widget: AiWidget): string {
  if (widget.type === "stock") return `stock:${widget.ticker}:${widget.range}`;
  if (widget.type === "compare") return `compare:${widget.range}:${widget.items.map((item) => item.ticker).join(",")}`;
  if (widget.type === "portfolio") return "portfolio";
  if (widget.type === "buy") return `buy:${widget.ticker}`;
  if (widget.type === "company") return `company:${widget.ticker}`;
  if (widget.type === "portfolio-today") return "portfolio-today";
  if (widget.type === "simulation") return `simulation:${widget.ticker}`;
  if (widget.type === "alert-confirm") {
    return `alert-confirm:${widget.ticker}:${widget.direction}:${widget.thresholdUsd}`;
  }
  if (widget.type === "daily-summary") return "daily-summary";
  return `import:${widget.positions.map((position) => position.ticker).join(",")}`;
}

function pushWidget(list: AiWidget[], widget: AiWidget): void {
  const key = widgetKey(widget);
  const index = list.findIndex((item) => widgetKey(item) === key);
  if (index >= 0) list.splice(index, 1);
  list.push(widget);
}

export function withDisclaimer(text: string, stockRelated: boolean): string {
  const trimmed = text.trim();
  const body = trimmed.length > 0 ? trimmed : stockRelated ? copy.dataLine : copy.emptyAnswer;
  if (!stockRelated) return body;
  if (fold(body).includes(fold(copy.disclaimer))) return body;
  return `${body}\n\n${copy.disclaimer}`;
}

function toHistory(system: string, messages: AiChatRequest["messages"], image?: string): XaiMessage[] {
  let lastUser = -1;
  messages.forEach((message, index) => {
    if (message.role === "user") lastUser = index;
  });
  const out: XaiMessage[] = [{ role: "system", content: system }];
  messages.forEach((message, index) => {
    if (message.role === "user" && index === lastUser && image) {
      const content: XaiContentPart[] = [
        { type: "text", text: message.content },
        { type: "image_url", image_url: { url: image } },
      ];
      out.push({ role: "user", content });
      return;
    }
    out.push({ role: message.role, content: message.content });
  });
  return out;
}

export interface ParsedSlashCommand {
  name: string;
  arguments: string;
}

/**
 * Parsea un comando que empiece explícitamente con `/`.
 * Si el texto no empieza con uno de los comandos soportados, devuelve `null`.
 */
export function parseSlashCommand(text: string, contextTicker?: string): ParsedSlashCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;

  const match = trimmed.match(/^(\/[a-záéíóúñ]+)(?:\s+(.*))?$/i);
  if (!match) return null;

  const cmd = match[1]!.toLowerCase();
  const rest = (match[2] ?? "").trim();

  // /grafico o /gráfico
  if (cmd === "/grafico" || cmd === "/gráfico") {
    const tokens = rest ? rest.split(/\s+/).filter(Boolean) : [];
    let range: "1D" | "1W" | "1M" = "1D";
    let query = "";
    if (tokens.length > 0) {
      const last = tokens[tokens.length - 1]!.toUpperCase();
      if (last === "1D" || last === "1W" || last === "1M") {
        range = last;
        query = tokens.slice(0, -1).join(" ").trim();
      } else {
        query = tokens.join(" ").trim();
      }
    }
    const finalQuery = query || contextTicker || "";
    return {
      name: "get_stock",
      arguments: JSON.stringify({ query: finalQuery, range }),
    };
  }

  // /cartera o /portafolio
  if (cmd === "/cartera" || cmd === "/portafolio") {
    return {
      name: "portfolio_today",
      arguments: "{}",
    };
  }

  // /comparar
  if (cmd === "/comparar") {
    const rawTokens = rest ? rest.split(/[\s,]+/).filter(Boolean) : [];
    let range: "1W" | "1M" | "1Y" = "1M";
    const tickers: string[] = [];
    for (let i = 0; i < rawTokens.length; i += 1) {
      const tok = rawTokens[i]!;
      const upper = tok.toUpperCase();
      if (i === rawTokens.length - 1 && (upper === "1W" || upper === "1M" || upper === "1Y")) {
        range = upper;
      } else {
        tickers.push(tok);
      }
    }
    if (tickers.length === 0 && contextTicker) {
      tickers.push(contextTicker);
    }
    return {
      name: "compare_stocks",
      arguments: JSON.stringify({ tickers, range }),
    };
  }

  // /empresa
  if (cmd === "/empresa") {
    const ticker = rest || contextTicker || "";
    return {
      name: "get_company_facts",
      arguments: JSON.stringify({ ticker }),
    };
  }

  // /simular
  if (cmd === "/simular") {
    const tokens = rest ? rest.split(/\s+/).filter(Boolean) : [];
    let ticker = "";
    let amountUsd: number | undefined;
    let monthlyClp: number | undefined;
    let months: number | undefined;

    for (const tok of tokens) {
      const cleanNum = Number(tok.replace("$", "").replace(/\./g, "").replace(",", "."));
      if (!Number.isNaN(cleanNum) && cleanNum > 0) {
        if (amountUsd === undefined) amountUsd = cleanNum;
        else if (monthlyClp === undefined) monthlyClp = cleanNum;
        else if (months === undefined) months = Math.round(cleanNum);
      } else if (!ticker) {
        ticker = tok;
      }
    }
    const finalTicker = ticker || contextTicker || "";
    const args: Record<string, unknown> = { ticker: finalTicker };
    if (amountUsd !== undefined) args.amountUsd = amountUsd;
    if (monthlyClp !== undefined) args.monthlyClp = monthlyClp;
    if (months !== undefined) args.months = months;
    return {
      name: "simulate_buy",
      arguments: JSON.stringify(args),
    };
  }

  // /alerta
  if (cmd === "/alerta") {
    let direction: "above" | "below" = "above";
    if (/\b(baja|below|<|menor)\b/i.test(rest)) direction = "below";
    const cleaned = rest.replace(/[><]/g, " ").replace(/\b(sube|above|mayor|baja|below|menor)\b/gi, " ");
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    let ticker = "";
    let thresholdUsd: number | undefined;

    for (const tok of tokens) {
      const cleanNum = Number(tok.replace("$", "").replace(/\./g, "").replace(",", "."));
      if (!Number.isNaN(cleanNum) && cleanNum > 0) {
        thresholdUsd = cleanNum;
      } else if (!ticker) {
        ticker = tok;
      }
    }
    const finalTicker = ticker || contextTicker || "";
    return {
      name: "propose_price_alert",
      arguments: JSON.stringify({
        ticker: finalTicker,
        direction,
        thresholdUsd: thresholdUsd ?? 100,
      }),
    };
  }

  // /resumen
  if (cmd === "/resumen") {
    return {
      name: "daily_summary",
      arguments: "{}",
    };
  }

  // /copiar
  if (cmd === "/copiar") {
    return {
      name: "list_copy_portfolios",
      arguments: "{}",
    };
  }

  return null;
}

function assistantTurn(content: string, calls: readonly { id: string; name: string; arguments: string }[]): XaiMessage {
  const tool_calls: XaiToolCallPayload[] = calls.map((call) => ({
    id: call.id,
    type: "function",
    function: { name: call.name, arguments: call.arguments },
  }));
  return { role: "assistant", content: content.trim() ? content : null, tool_calls };
}

/** Opciones del motor de streaming (§1.4). Sin `onDelta` el bucle es el de siempre. */
export interface RunChatOptions {
  /** Recibe cada trozo nuevo de la ronda final de texto. */
  onDelta?: (chunk: string) => void;
  /** Sólo tests: reemplaza `callXaiStream`. */
  stream?: typeof callXaiStream;
}

/**
 * Bucle de como máximo 4 rondas de herramientas. Los widgets salen de las
 * herramientas, no del texto del modelo. La última vuelta, si todavía pide
 * tools, se hace sin ellas para cerrar con una frase.
 *
 * Con `onDelta` (§1.4), la ronda final de texto va sin herramientas y se
 * transmite con `callXaiStream`; las rondas de herramientas siguen sin
 * streaming. El aviso se agrega al texto final, nunca a los trozos.
 */
export async function runChat(
  input: RunChatInput,
  deps: AssistantDeps = defaultAssistantDeps(),
  complete: typeof callXai = callXai,
  options: RunChatOptions = {},
): Promise<{ text: string; widgets: AiWidget[] }> {
  let viewing: { ticker: string; name: string } | undefined;
  const contextTicker = input.context?.ticker?.trim();
  if (contextTicker) {
    const asset = await deps.resolveTicker(contextTicker).catch(() => null);
    if (asset) viewing = { ticker: asset.ticker, name: asset.name };
  }
  const history = toHistory(buildSystemPrompt(viewing), input.messages, input.image);
  const widgets: AiWidget[] = [];
  let stockRelated = false;
  const onDelta = options.onDelta;
  const streamer = options.stream ?? callXaiStream;
  let toolRounds = 0;

  // Ejecución segura y determinista de comandos slash antes de la ronda 1
  const lastUserMessage = [...input.messages].reverse().find((m) => m.role === "user");
  const firstLine = lastUserMessage?.content.trim().split(/\r?\n/, 1)[0];
  const slash = firstLine ? parseSlashCommand(firstLine, viewing?.ticker ?? contextTicker) : null;

  if (slash) {
    const callId = `slash_${Date.now()}`;
    const result = await executeToolCall(slash.name, slash.arguments, input.req, deps);
    if (result.stockRelated) stockRelated = true;
    for (const widget of result.widgets) pushWidget(widgets, widget);
    history.push(assistantTurn("", [{ id: callId, name: slash.name, arguments: slash.arguments }]));
    history.push({ role: "tool", tool_call_id: callId, content: result.content });
    toolRounds += 1;
  }

  const apply = async (calls: { id: string; name: string; arguments: string }[]) => {
    const limited = calls.slice(0, MAX_CALLS_PER_ROUND);
    const skipped = calls.slice(MAX_CALLS_PER_ROUND);
    for (const call of limited) {
      const result = await executeToolCall(call.name, call.arguments, input.req, deps);
      if (result.stockRelated) stockRelated = true;
      for (const widget of result.widgets) pushWidget(widgets, widget);
      history.push({ role: "tool", tool_call_id: call.id, content: result.content });
    }
    for (const call of skipped) {
      history.push({ role: "tool", tool_call_id: call.id, content: copy.rateLimited });
    }
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    // Después de las herramientas, la ronda final de texto va sin tools y se
    // transmite (§1.4): así el cliente ve el texto mientras se genera. Las
    // rondas de herramientas (con tools) siguen sin streaming.
    if (typeof onDelta === "function" && toolRounds > 0) {
      const streamed = await streamer(history, { onDelta });
      if (streamed.content.trim() !== "") {
        return { text: withDisclaimer(streamed.content, stockRelated), widgets };
      }
      // El stream no trajo texto: se cierra con una vuelta normal.
      const closing = await complete(history, {});
      return { text: withDisclaimer(closing.content, stockRelated), widgets };
    }
    const completion = await complete(history, { tools: AI_TOOLS });
    if (completion.toolCalls.length === 0) {
      const text = withDisclaimer(completion.content, stockRelated);
      if (typeof onDelta === "function" && completion.content.trim() !== "") onDelta(completion.content);
      return { text, widgets };
    }
    history.push(assistantTurn(completion.content, completion.toolCalls));
    await apply(completion.toolCalls);
    toolRounds += 1;
  }

  try {
    const closing = await complete(history, {});
    return { text: withDisclaimer(closing.content, stockRelated), widgets };
  } catch (error) {
    if (widgets.length === 0) throw error;
    return { text: withDisclaimer("", true), widgets };
  }
}
