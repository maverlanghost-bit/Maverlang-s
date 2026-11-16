"use client";

import { historyDescription, type FinancialPoint } from "@/lib/charts/data";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/lib/hooks/use-t";
import type { Currency } from "@/lib/types";

export function ChartContext({ source, points, currency = "USD", range, underlying }: {
  source?: string;
  points: readonly FinancialPoint[];
  currency?: Currency;
  range?: string;
  underlying?: string;
}) {
  const { language } = useT();
  const en = language === "en";
  const last = points[points.length - 1];
  const lastTime = last?.observedAt ?? last?.t;
  return (
    <div className="flex flex-col gap-1 text-xs leading-relaxed text-fg-muted" data-chart-source={source ?? "unavailable"}>
      <p>
        {historyDescription(source, en)}{source === "closes" && underlying ? ` · ${underlying}` : ""}
        {` · ${currency}`}
        {lastTime && Number.isFinite(lastTime) ? <> · {en ? "Last observation" : "Último registro"}: <time dateTime={new Date(lastTime).toISOString()}>{formatDateTime(new Date(lastTime).toISOString())}</time></> : null}
      </p>
      {currency === "CLP" ? <p>{en ? "Converted at the current reference exchange rate; this is not a historical return in CLP." : "Conversión al dólar de referencia actual; no representa la rentabilidad histórica en pesos."}</p> : null}
      {range === "1D" ? <p>{en ? "Intraday window; underlying market sessions may span more than 24 hours." : "Ventana intradía; las jornadas del subyacente pueden abarcar más de 24 horas."}</p> : null}
    </div>
  );
}
