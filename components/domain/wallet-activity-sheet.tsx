"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { activityFolio } from "@/components/domain/activity-item";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { IconCheck, IconClock, IconClose } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { supportMailto } from "@/config/site";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/lib/hooks/use-t";
import type { Activity, OrderStatus } from "@/lib/types";
import { explorerTxUrl } from "@/lib/wallet/explorer";

export const MOVEMENT_HELP_HREF = "/ayuda#movimientos";

const STATES = {
  pending: ["La confirmación sigue pendiente. Puedes consultar el estado antes de intentar otra operación.", "Confirmation is pending. Check the status before trying another transaction."],
  submitted: ["La operación se envió y está pendiente de confirmación. Consulta su estado antes de intentar otra operación.", "The transaction was submitted and is awaiting confirmation. Check its status before trying another transaction."],
  confirmed: ["El movimiento está confirmado en tu historial.", "The movement is confirmed in your history."],
  failed: ["El historial registra un fallo. Si ves un cargo asociado, contacta a soporte con el folio.", "Your history shows a failure. If you see a related charge, contact support with the reference."],
  expired: ["La operación venció. Si ves un cargo asociado, contacta a soporte con el folio.", "The transaction expired. If you see a related charge, contact support with the reference."],
} satisfies Record<OrderStatus, [string, string]>;

export function WalletActivitySheet({ id, row, tone, amount, demo, onClose, onRefresh }: {
  id: string;
  row: Activity | undefined;
  tone: BadgeTone;
  amount: ReactNode;
  demo: boolean;
  onClose: () => void;
  onRefresh: () => Promise<boolean>;
}) {
  const { t, language } = useT();
  const en = language === "en";
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<"updated" | "error" | null>(null);
  const folio = activityFolio(id);
  const mailto = supportMailto();
  const subject = `${en ? "Movement" : "Movimiento"} ${folio}`;
  const body = `${en ? "Movement ID" : "ID del movimiento"}\n${id}`;
  const contactHref = mailto ? `${mailto}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : null;
  const explorerHref = !demo && row?.signature && /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(row.signature)
    ? explorerTxUrl(row.signature)
    : null;
  const StatusIcon = tone === "up" ? IconCheck : tone === "down" ? IconClose : IconClock;

  async function refresh() {
    setRefreshing(true);
    setRefreshStatus(null);
    try {
      setRefreshStatus(await onRefresh() ? "updated" : "error");
    } catch {
      setRefreshStatus("error");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Sheet open onOpenChange={onClose} title={en ? "Movement details" : "Detalle del movimiento"}>
      <div className="space-y-6 pb-2">
        {row ? (
          <section aria-label={en ? "Movement status" : "Estado del movimiento"} className="rounded-2xl border border-border bg-surface-1 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-full ring-1 ring-inset ring-border",
                tone === "up" && "bg-up-bg text-up",
                tone === "warn" && "bg-warn-bg text-warn",
                tone === "down" && "bg-down-bg text-down",
                tone === "neutral" && "bg-surface-2 text-fg-muted",
              )}>
                <StatusIcon className="size-5" />
              </span>
              <Badge tone={tone}>{t.portfolio.status[row.status]}</Badge>
            </div>
            <h3 className="mt-4 text-sm font-medium text-fg-muted">{t.wallet.kinds[row.kind]} · {row.symbol}</h3>
            <p className="num mt-1 text-2xl leading-tight font-semibold break-words text-fg">{amount}</p>
            <p className="mt-3 text-sm leading-relaxed text-fg-muted">{STATES[row.status][en ? 1 : 0]}</p>
          </section>
        ) : (
          <p className="rounded-xl border border-border bg-surface-1 p-4 text-sm leading-relaxed text-fg-muted">
            {en ? "This movement is currently unavailable in your history." : "Este movimiento no está disponible en tu historial en este momento."}
          </p>
        )}

        <dl className="divide-y divide-border border-y border-border text-sm">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3">
            <dt className="col-start-1 row-start-1 text-xs text-fg-muted">{en ? "Reference" : "Folio"}</dt>
            <dd className="num col-start-1 row-start-2 font-medium break-all text-fg">{folio}</dd>
            <dd className="col-start-2 row-span-2 row-start-1">
              <CopyButton value={id} label={en ? "Copy ID" : "Copiar ID"} copiedLabel={en ? "Copied" : "Copiado"} />
            </dd>
          </div>
          {row ? (
            <div className="flex flex-wrap items-center justify-between gap-2 py-3">
              <dt className="text-fg-muted">{en ? "Recorded at" : "Fecha de registro"}</dt>
              <dd><time className="num text-fg" dateTime={row.at}>{formatDateTime(row.at)}</time></dd>
            </div>
          ) : null}
        </dl>

        <div className="space-y-2">
          <Button variant="secondary" className="w-full" loading={refreshing} onClick={() => void refresh()}>
            {en ? "Check status" : "Consultar estado"}
          </Button>
          {explorerHref ? (
            <Button asChild variant="ghost" className="w-full">
              <a href={explorerHref} target="_blank" rel="noopener noreferrer">
                {t.trade.explorer}<span className="sr-only"> {t.trade.explorerNew}</span><span aria-hidden="true">↗</span>
              </a>
            </Button>
          ) : null}
          <p role="status" className="text-center text-xs leading-relaxed text-fg-muted">
            {refreshStatus === "updated" ? (en ? "Status checked." : "Estado consultado.") : null}
            {refreshStatus === "error" ? (en ? "We couldn’t check this movement. Try again in a moment." : "No pudimos consultar este movimiento. Prueba de nuevo en un momento.") : null}
          </p>
        </div>

        <div className="rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-fg">{en ? "Need help?" : "¿Necesitas ayuda?"}</h3>
          <p className="mt-1 text-sm leading-relaxed text-fg-muted">
            {en ? "Share your movement reference so support can find it." : "Comparte el folio o el ID para que soporte pueda ubicar el movimiento."}
          </p>
          {contactHref ? (
            <Button asChild variant="secondary" size="sm" className="mt-3">
              <a href={contactHref}>{en ? "Contact support" : "Contactar a soporte"}</a>
            </Button>
          ) : (
            <Button asChild variant="secondary" size="sm" className="mt-3">
              <Link href={MOVEMENT_HELP_HREF}>{en ? "Movement help" : "Ayuda con movimientos"}</Link>
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
