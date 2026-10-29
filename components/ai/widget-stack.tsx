"use client";

import { ImportPreview } from "@/components/ai/import/import-preview";
import { BuyWidget, CompareWidget, PortfolioWidget, StockWidget } from "@/components/ai/widgets";
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
  if (widget.type === "stock" || widget.type === "buy") return widget.ticker;
  if (widget.type === "compare") return widget.items.map((item) => item.ticker).join("-");
  if (widget.type === "portfolio") return widget.positions.map((item) => item.ticker).join("-");
  return String(widget.positions.length);
}
