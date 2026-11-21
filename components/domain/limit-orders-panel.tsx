"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { formatUnitPrice } from "@/lib/market/price-format";
import { useT } from "@/lib/hooks/use-t";
import {
  cancelLimitOrder,
  useLimitOrders,
  type LimitOrderExpiry,
} from "@/lib/trade/limit-orders-store";

function expiryLabel(expiry: LimitOrderExpiry, isEn: boolean): string {
  if (expiry === "7d") return isEn ? "7 days" : "7 días";
  if (expiry === "30d") return isEn ? "30 days" : "30 días";
  return isEn ? "Good 'til cancelled" : "Hasta cancelar";
}

/**
 * Panel de órdenes límite guardadas en este navegador.
 * Acepta `symbol` opcional para filtrar por activo o mostrar todos.
 */
export function LimitOrdersPanel({
  symbol,
  className,
  ordersOnly = false,
}: {
  symbol?: string;
  className?: string;
  ordersOnly?: boolean;
}) {
  const { language } = useT();
  const isEn = language === "en";
  const session = useSession();
  const ownerId = session.status === "authenticated" ? session.user?.id : undefined;
  const savedOrders = useLimitOrders(symbol, ownerId);
  const limitOrders = ownerId ? savedOrders : [];

  if (ordersOnly && limitOrders.length === 0) return null;
  if (limitOrders.length === 0) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-border bg-surface-1 px-5 py-6 text-[13px] leading-relaxed text-fg-muted",
          className,
        )}
      >
        {isEn
          ? "No saved demo orders yet."
          : "No tienes órdenes demo guardadas."}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {limitOrders.length > 0 ? (
        <section aria-label={isEn ? "Demo limit orders" : "Órdenes límite demo"} className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="label">{isEn ? "Saved demo orders" : "Órdenes demo guardadas"}</h3>
            <span className="num text-[12px] text-fg-muted">{limitOrders.length}</span>
          </div>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface-1">
            {limitOrders.map((order) => {
              const isActive = order.status === "active";
              const sideText =
                order.side === "buy" ? (isEn ? "Buy" : "Compra") : isEn ? "Sell" : "Venta";
              return (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num text-sm font-medium text-fg">{order.symbol}</span>
                      <Badge tone={order.side === "buy" ? "up" : "down"}>{sideText}</Badge>
                      <Badge tone={isActive ? "neutral" : "warn"}>
                        {isActive
                          ? isEn
                            ? "Saved"
                            : "Guardada"
                          : isEn
                            ? "Cancelled"
                            : "Cancelada"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[12px] leading-4 text-fg-muted">
                      <span className="num font-medium text-fg-body">
                        {formatMoney(order.amountUsd, "USD")}
                      </span>
                      {" · "}
                      {isEn ? "Limit" : "Límite"}{" "}
                      <span className="num font-medium text-fg-body">
                        {formatUnitPrice(order.targetPriceUsd, "USD", language)}
                      </span>
                      {" · "}
                      {expiryLabel(order.expiry, isEn)}
                    </p>
                  </div>

                  {isActive ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => cancelLimitOrder(order.id)}
                      aria-label={
                        isEn
                          ? `Cancel limit order for ${order.symbol}`
                          : `Cancelar orden límite de ${order.symbol}`
                      }
                    >
                      {isEn ? "Cancel" : "Cancelar"}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

    </div>
  );
}
