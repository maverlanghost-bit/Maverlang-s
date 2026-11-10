"use client";

import { ImportPreview } from "@/components/ai/import/import-preview";
import { BuyWidget, CompareWidget, PortfolioWidget, StockWidget } from "@/components/ai/widgets";
import {
  AlertConfirmWidget,
  CompanyWidget,
  PortfolioTodayWidget,
  SimulationWidget,
} from "@/components/ai/widgets-t1";
import { DailySummaryWidget } from "@/components/ai/widgets-t2";
import type { AsistenteCopy } from "@/content/i18n/extra-asistente";
import type { AiWidget } from "@/components/ai/contract";

export function AiWidgetStack({ widgets, copy }: { widgets: readonly AiWidget[]; copy: AsistenteCopy }) {
  if (widgets.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {widgets.map((widget, index) => (
        <div key={`${widget.type}-${widgetKey(widget)}-${index}`} className="min-w-0">
          <WidgetView widget={widget} copy={copy} />
        </div>
      ))}
    </div>
  );
}

function WidgetView({ widget, copy }: { widget: AiWidget; copy: AsistenteCopy }) {
  switch (widget.type) {
    case "stock":
      return <StockWidget widget={widget} copy={copy} />;
    case "compare":
      return <CompareWidget widget={widget} copy={copy} />;
    case "portfolio":
      return <PortfolioWidget widget={widget} copy={copy} />;
    case "buy":
      return <BuyWidget widget={widget} copy={copy} />;
    case "company":
      return <CompanyWidget widget={widget} />;
    case "portfolio-today":
      return <PortfolioTodayWidget widget={widget} />;
    case "simulation":
      return <SimulationWidget widget={widget} />;
    case "alert-confirm":
      return <AlertConfirmWidget widget={widget} />;
    case "daily-summary":
      return <DailySummaryWidget widget={widget} />;
    case "import-preview":
      return (
        <div data-ai-widget="import-preview">
          <ImportPreview positions={widget.positions} />
        </div>
      );
    default:
      return null;
  }
}

function widgetKey(widget: AiWidget): string {
  switch (widget.type) {
    case "stock":
    case "buy":
    case "company":
    case "simulation":
      return widget.ticker;
    case "compare":
      return widget.items.map((item) => item.ticker).join("-");
    case "portfolio":
      return widget.positions.map((item) => item.ticker).join("-");
    case "portfolio-today":
      return "portfolio-today";
    case "daily-summary":
      return widget.asOf ?? "daily-summary";
    case "alert-confirm":
      return `${widget.ticker}-${widget.direction}-${widget.thresholdUsd}`;
    case "import-preview":
      return String(widget.positions.length);
    default:
      return "widget";
  }
}
