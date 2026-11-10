/**
 * Contrato compartido del asistente. Las otras partes lo importan tal cual.
 * Los widgets los arma el servidor con datos de los servicios; el modelo no
 * los inventa. `open_buy` sólo lleva un enlace: no ejecuta órdenes.
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
      items: {
        ticker: string;
        name: string;
        changePct: number | null;
        points: { t: number; p: number }[];
      }[];
      range: "1W" | "1M" | "1Y";
    }
  | {
      type: "portfolio";
      totalUsd: number | null;
      pnlPct: number | null;
      positions: { ticker: string; name: string; valueUsd: number | null; weightPct: number | null }[];
    }
  | { type: "buy"; ticker: string; name: string; href: string }
  | { type: "company"; ticker: string; name: string; facts: { label: string; value: string | null }[]; source: string; asOf: string | null }
  | { type: "portfolio-today"; totalUsd: number | null; cashUsdc: number | null; positions: { ticker: string; name: string; valueUsd: number | null; weightPct: number | null; changePct: number | null }[]; hhi: number | null; effectivePositions: number | null; top1Pct: number | null; top3Pct: number | null }
  | { type: "simulation"; ticker: string; name: string; priceUsd: number | null; amountUsd: number | null; units: number | null; monthlyClp: number | null; usdClp: number | null; monthlyUsd: number | null; months: number | null; totalUsd: number | null }
  | { type: "alert-confirm"; ticker: string; name: string; direction: "above" | "below"; thresholdUsd: number; priceUsd: number | null }
  | { type: "daily-summary"; asOf: string | null; gainers: { ticker: string; name: string; changePct: number | null }[]; losers: { ticker: string; name: string; changePct: number | null }[]; portfolio: { totalUsd: number | null; changePct: number | null } | null }
  | {
      type: "import-preview";
      positions: { ticker: string; name: string | null; quantity: number | null; matched: boolean }[];
    };

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  widgets?: AiWidget[];
  imageDataUrl?: string;
}

export interface AiChatRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  /** dataURL jpg/png */
  image?: string;
  context?: { ticker?: string };
}

export type AiChatResponse =
  | {
      ok: true;
      text: string;
      widgets: AiWidget[];
    }
  | {
      ok: false;
      error: "not_configured" | "rate_limited" | "bad_request" | "upstream";
      message: string;
    };
