import "server-only";

import { aiMessages } from "@/content/i18n/extra-b";
import { fold } from "@/lib/market/browse";
import { getServices } from "@/lib/services";
import type { AiChatRequest, AiWidget } from "@/lib/ai/types";
import { loadPortfolioForAssistant } from "@/lib/ai/portfolio";
import { resolveTicker, searchTickers } from "@/lib/ai/resolve";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { AI_TOOLS, executeToolCall, type AssistantDeps } from "@/lib/ai/tools";
import { callXai, type XaiContentPart, type XaiMessage, type XaiToolCallPayload } from "@/lib/ai/xai";

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

function assistantTurn(content: string, calls: readonly { id: string; name: string; arguments: string }[]): XaiMessage {
  const tool_calls: XaiToolCallPayload[] = calls.map((call) => ({
    id: call.id,
    type: "function",
    function: { name: call.name, arguments: call.arguments },
  }));
  return { role: "assistant", content: content.trim() ? content : null, tool_calls };
}

/**
 * Bucle de como máximo 4 rondas de herramientas. Los widgets salen de las
 * herramientas, no del texto del modelo. La última vuelta, si todavía pide
 * tools, se hace sin ellas para cerrar con una frase.
 */
export async function runChat(
  input: RunChatInput,
  deps: AssistantDeps = defaultAssistantDeps(),
  complete: typeof callXai = callXai,
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
    const completion = await complete(history, { tools: AI_TOOLS });
    if (completion.toolCalls.length === 0) {
      return { text: withDisclaimer(completion.content, stockRelated), widgets };
    }
    history.push(assistantTurn(completion.content, completion.toolCalls));
    await apply(completion.toolCalls);
  }

  try {
    const closing = await complete(history, {});
    return { text: withDisclaimer(closing.content, stockRelated), widgets };
  } catch (error) {
    if (widgets.length === 0) throw error;
    return { text: withDisclaimer("", true), widgets };
  }
}
