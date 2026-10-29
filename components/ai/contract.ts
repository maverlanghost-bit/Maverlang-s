/**
 * Contrato compartido del asistente.
 * La PARTE B lo publica en `lib/ai/types.ts` con esta misma forma.
 * Esta copia deja la interfaz lista aunque ese archivo llegue en otro commit.
 */

export type AiWidget =
  | {
      type: "stock";
      ticker: string;
      name: string;
      priceUsd: number | null;
      changePct: number | null;
      range: "1D" | "1W" | "1M";
      points: { t: number; p: number }[];
    }
  | {
      type: "compare";
      items: { ticker: string; name: string; changePct: number | null; points: { t: number; p: number }[] }[];
      range: "1W" | "1M" | "1Y";
    }
  | {
      type: "portfolio";
      totalUsd: number | null;
      pnlPct: number | null;
      positions: { ticker: string; name: string; valueUsd: number | null; weightPct: number | null }[];
    }
  | { type: "buy"; ticker: string; name: string; href: string }
  | { type: "import-preview"; positions: { ticker: string; name: string | null; quantity: number | null; matched: boolean }[] };

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  widgets?: AiWidget[];
  imageDataUrl?: string;
}

export interface AiChatRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  image?: string;
  context?: { ticker?: string };
}

export type AiChatResponse =
  | { ok: true; text: string; widgets: AiWidget[] }
  | { ok: false; error: "not_configured" | "rate_limited" | "bad_request" | "upstream"; message: string };
