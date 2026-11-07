"use client";

import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";

import { site } from "@/config/site";
import { cn } from "@/lib/cn";
import { formatClp, formatDateTime, formatShares, formatUsd } from "@/lib/format";
import type { Currency } from "@/lib/types";
import { explorerTxUrl } from "@/lib/wallet/explorer";

type TradeReceiptStatus = "pending" | "submitted" | "confirmed" | "failed";

const STATUS_META: Record<
  TradeReceiptStatus,
  { label: string; badgeClassName: string; dotClassName: string }
> = {
  confirmed: {
    label: "Confirmada on-chain",
    badgeClassName: "border-up/25 bg-up-bg text-up",
    dotClassName: "bg-up",
  },
  submitted: {
    label: "Enviada",
    badgeClassName: "border-info/25 bg-info-bg text-info",
    dotClassName: "bg-info",
  },
  pending: {
    label: "Pendiente",
    badgeClassName: "border-warn/25 bg-warn-bg text-warn",
    dotClassName: "bg-warn",
  },
  failed: {
    label: "Fallida",
    badgeClassName: "border-down/25 bg-down-bg text-down",
    dotClassName: "bg-down",
  },
};

function truncateHash(signature: string) {
  if (signature.length <= 14) return signature;
  return `${signature.slice(0, 6)}…${signature.slice(-6)}`;
}

function ReceiptRow({
  label,
  value,
  strong = false,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="shrink-0 text-xs text-fg-muted">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right text-sm",
          mono && "font-mono text-xs tracking-tight",
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
    ? "••••"
    : currency === "CLP" && rate
      ? formatClp(usd * rate)
      : "—";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border/80 bg-surface-1 px-2.5 py-1 text-xs font-medium text-fg-body transition hover:border-fg/30 hover:bg-surface-2 hover:text-fg"
      >
        Comprobante
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/35 p-0 sm:items-center sm:p-4"
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
            className="w-full max-w-md rounded-t-2xl border border-border bg-white p-5 text-fg outline-none shadow-[0_1px_0_rgba(0,0,0,0.04)] sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="label">{site.name} · Comprobante</p>
                <h2 id={titleId} className="mt-1 text-base font-medium tracking-tight text-fg">
                  Comprobante de Operación
                </h2>
                <p id={folioId} className="mt-1 font-mono text-xs tracking-tight text-fg-muted">
                  Folio {folio}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  statusMeta.badgeClassName,
                )}
              >
                <span className={cn("size-1.5 rounded-full", statusMeta.dotClassName)} aria-hidden="true" />
                {statusMeta.label}
              </span>
            </div>

            <dl className="mt-4 divide-y divide-border/80 border-y border-border/80">
              <ReceiptRow
                label="Operación"
                value={kind === "buy" ? "Compra de acción tokenizada" : "Venta de acción tokenizada"}
                strong
              />
              <ReceiptRow label="Activo" value={`${tickerName} (${symbol})`} strong />
              <ReceiptRow label="Fecha y hora" value={formatDateTime(at)} />
              <ReceiptRow label="Cantidad" value={sharesLabel} />
              <ReceiptRow label="Precio implícito unitario" value={unitPriceLabel} />
              <ReceiptRow label="Monto total USD" value={totalUsdLabel} strong />
              <ReceiptRow label="Equivalente CLP" value={totalClpLabel} />
              <ReceiptRow label="Comisión plataforma" value="US$0,00 (0%)" />
              <ReceiptRow label="Liquidación" value="Solana SPL · Autocustodia" />
            </dl>

            {signature ? (
              <div className="mt-4 rounded-xl border border-border/80 bg-surface-1 px-3 py-2">
                <p className="label">Hash de la transacción</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-mono text-xs tracking-tight text-fg-body">
                    {truncateHash(signature)}
                  </span>
                  <a
                    href={explorerTxUrl(signature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs font-medium text-fg underline decoration-border-strong underline-offset-4 transition hover:decoration-fg"
                  >
                    Ver en Solscan
                  </a>
                </div>
              </div>
            ) : null}

            <p className="mt-3 text-[11px] leading-relaxed text-fg-muted">
              Documento informativo de la operación. No constituye un instrumento tributario.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void copyFolio()}
                className="inline-flex min-h-9 items-center rounded-full border border-border bg-white px-3 text-xs font-medium text-fg-body transition hover:border-fg/30 hover:bg-surface-1"
              >
                {copied ? "Folio copiado" : "Copiar folio"}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex min-h-9 items-center rounded-full border border-border bg-white px-3 text-xs font-medium text-fg-body transition hover:border-fg/30 hover:bg-surface-1"
              >
                Imprimir / PDF
              </button>
              <button
                type="button"
                onClick={close}
                className="ml-auto inline-flex min-h-9 items-center rounded-full bg-fg px-4 text-xs font-medium text-white transition hover:bg-[#1f2329]"
              >
                Cerrar
              </button>
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
