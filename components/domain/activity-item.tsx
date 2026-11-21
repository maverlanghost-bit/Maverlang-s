import type { ReactNode } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { IconChevron } from "@/components/ui/icons";

export function activityFolio(id: string) {
  // Los folios de órdenes UUID coinciden con los comprobantes de compraventa.
  // Los identificadores de demo pueden compartir un prefijo largo.
  const folio = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id) ? id.slice(0, 8) : id;
  return `#MV-${folio.toUpperCase()}`;
}

/**
 * Fila de actividad: qué pasó y cuándo, con el estado a la derecha. Sin
 * contenedor propio; vive sobre los hairlines de la lista que la usa.
 */
export function ActivityItem({
  title,
  detail,
  time,
  dateTime,
  status,
  tone,
  onOpen,
}: {
  title: string;
  detail: ReactNode;
  time: string;
  dateTime: string;
  status: string;
  tone: BadgeTone;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onOpen}
      className="group grid min-h-16 w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg px-2 py-3 text-left transition-colors hover:bg-surface-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fg sm:gap-4 sm:px-3"
    >
      <span className="min-w-0">
        <span className="block text-sm leading-snug font-semibold tracking-tight text-fg">
          {title}
        </span>
        <span className="num mt-1 block text-xs leading-snug text-fg-muted">{detail}</span>
      </span>
      <span className="flex flex-col items-end gap-1.5">
        <Badge tone={tone}>{status}</Badge>
        <time dateTime={dateTime} className="text-right text-[11px] tabular-nums text-fg-muted sm:text-xs">
          {time}
        </time>
      </span>
      <IconChevron className="size-4 -rotate-90 text-fg-muted group-hover:text-fg" />
    </button>
  );
}
