"use client";

import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { site } from "@/config/site";
import { cn } from "@/lib/cn";
import { formatClp, formatDateTime, formatShares, formatUsd } from "@/lib/format";
import type { Currency } from "@/lib/types";
import { explorerTxUrl } from "@/lib/wallet/explorer";

type TradeReceiptStatus = "pending" | "submitted" | "confirmed" | "failed";

const STATUS_META: Record<
  TradeReceiptStatus,
  { label: string; toneClassName: string; dotClassName: string }
> = {
  confirmed: { label: "Confirmada on-chain", toneClassName: "text-up", dotClassName: "bg-up" },
  submitted: { label: "Enviada", toneClassName: "text-info", dotClassName: "bg-info" },
  pending: { label: "Pendiente", toneClassName: "text-warn", dotClassName: "bg-warn" },
  failed: { label: "Fallida", toneClassName: "text-down", dotClassName: "bg-down" },
};

function truncateHash(signature: string) {
  if (signature.length <= 14) return signature;
  return `${signature.slice(0, 6)}…${signature.slice(-6)}`;
}

function ReceiptRow({
  label,
  value,
  strong = false,
  numeric = true,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
  numeric?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-6 py-2.5">
      <dt className="label-xs min-w-0">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right leading-5",
          numeric ? "num text-[13px]" : "text-[13px]",
          strong ? "font-medium text-fg" : "text-fg-body",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function TradeReceiptTrigger({
  id,
  kind,
  symbol,
  tickerName,
  shares,
  usd,
  at,
  status,
  signature,
  currency,
  rate,
  masked = false,
}: {
  id: string;
  kind: "buy" | "sell";
  symbol: string;
  tickerName: string;
  shares?: number;
  usd: number;
  at: string;
  status: "pending" | "submitted" | "confirmed" | "failed";
  signature?: string;
  currency: Currency;
  rate?: number;
  masked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const titleId = useId();
  const folioId = useId();

  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const folio = `#MV-${id.slice(0, 8).toUpperCase()}`;
  const statusMeta = STATUS_META[status];

  const close = useCallback(() => {
    setOpen(false);
    setCopied(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  async function copyFolio() {
    try {
      await navigator.clipboard.writeText(folio);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const sharesLabel = masked ? "••••" : shares != null ? formatShares(shares) : "—";
  const unitPriceLabel = masked ? "••••" : shares && shares > 0 ? formatUsd(usd / shares) : "—";
  const totalUsdLabel = masked ? "••••" : formatUsd(usd);
  const totalClpLabel = masked
    ? null
    : currency === "CLP" && rate
      ? formatClp(usd * rate)
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border-control/50 bg-bg px-3 text-xs font-medium text-fg-body transition-colors duration-150 hover:border-fg/50 hover:text-fg"
      >
        Comprobante
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-fg/40 animate-fade-in sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={folioId}
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
            className="relative max-h-[92dvh] w-full max-w-[26rem] overflow-y-auto overscroll-contain rounded-t-3xl border border-border bg-bg px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-fg shadow-float outline-none animate-sheet-up sm:rounded-3xl sm:px-6 sm:py-6 sm:animate-pop-in"
          >
            <span
              aria-hidden="true"
              className="mx-auto mb-4 block h-1 w-9 rounded-full bg-border-strong/60 sm:hidden"
            />

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="label">{site.name}</p>
                <h2 id={titleId} className="mt-1.5 text-[17px] leading-6 font-medium tracking-[-0.01em] text-fg">
                  Comprobante
                </h2>
                <p id={folioId} className="num mt-1 text-[12px] leading-4 text-fg-muted">
                  Folio {folio}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 pt-1 text-[11px] leading-4 font-medium",
                  statusMeta.toneClassName,
                )}
              >
                <span className={cn("size-1.5 rounded-full", statusMeta.dotClassName)} aria-hidden="true" />
                {statusMeta.label}
              </span>
            </div>

            <div className="mt-5 -mx-5 border-y border-border px-5 py-4 sm:-mx-6 sm:px-6">
              <p className="label-xs">Total operación</p>
              <p className="num mt-2 text-[2rem] leading-none tracking-[-0.02em] text-fg">{totalUsdLabel}</p>
              {totalClpLabel ? <p className="num mt-2 text-[13px] leading-5 text-fg-muted">{totalClpLabel}</p> : null}
            </div>

            <dl className="divide-y divide-border/70">
              <ReceiptRow
                label="Operación"
                value={kind === "buy" ? "Compra de acción tokenizada" : "Venta de acción tokenizada"}
                numeric={false}
                strong
              />
              <ReceiptRow label="Activo" value={`${tickerName} (${symbol})`} numeric={false} strong />
              <ReceiptRow label="Fecha y hora" value={formatDateTime(at)} numeric={false} />
              <ReceiptRow label="Cantidad" value={sharesLabel} />
              <ReceiptRow label="Precio implícito unitario" value={unitPriceLabel} />
              <ReceiptRow label="Comisión plataforma" value="US$0,00 (0%)" />
              <ReceiptRow label="Liquidación" value="Solana SPL · Autocustodia" numeric={false} />
            </dl>

            {signature ? (
              <div className="mt-4 border-t border-border pt-3">
                <p className="label-xs">Hash de la transacción</p>
                <div className="mt-2 flex items-baseline justify-between gap-3">
                  <span className="num min-w-0 truncate text-[12px] tracking-tight text-fg-body">
                    {truncateHash(signature)}
                  </span>
                  <a
                    href={explorerTxUrl(signature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[12px] font-medium text-fg underline decoration-border-strong underline-offset-4 transition-colors hover:decoration-fg"
                  >
                    Ver en Solscan
                  </a>
                </div>
              </div>
            ) : null}

            <p className="mt-4 text-[11px] leading-relaxed text-fg-subtle">
              Documento informativo de la operación. No constituye un instrumento tributario.
            </p>

            <div className="mt-5 flex flex-col gap-1">
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => void copyFolio()}
                  className="inline-flex min-h-11 items-center px-2 text-[13px] font-medium text-fg-muted transition-colors duration-150 hover:text-fg"
                >
                  {copied ? "Folio copiado" : "Copiar folio"}
                </button>
                <span aria-hidden="true" className="h-3 w-px bg-border" />
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex min-h-11 items-center px-2 text-[13px] font-medium text-fg-muted transition-colors duration-150 hover:text-fg"
                >
                  Imprimir / PDF
                </button>
              </div>
              <Button size="lg" className="min-h-12 w-full text-[15px]" onClick={close}>
                Cerrar
              </Button>
              <span aria-live="polite" className="sr-only">
                {copied ? "Folio copiado al portapapeles" : ""}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
