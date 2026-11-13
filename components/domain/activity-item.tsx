import type { ReactNode } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";

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
  explorerHref,
  explorerLabel,
  explorerNew,
}: {
  title: string;
  detail: ReactNode;
  time: string;
  dateTime: string;
  status: string;
  tone: BadgeTone;
  explorerHref: string | null;
  explorerLabel: string;
  explorerNew: string;
}) {
  return (
    <div className="flex flex-col gap-2 py-4 transition-colors duration-150 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[15px] leading-tight font-medium tracking-tight text-balance text-fg sm:line-clamp-1">
          {title}
        </p>
        <p className="num mt-1 text-[13px] leading-tight tabular-nums text-fg-muted">{detail}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 sm:justify-end">
        <Badge tone={tone}>{status}</Badge>
        <time dateTime={dateTime} className="text-[13px] whitespace-nowrap tabular-nums text-fg-muted">
          {time}
        </time>
        {explorerHref ? (
          <a
            href={explorerHref}
            target="_blank"
            rel="noopener noreferrer"
            /* Área táctil de 44 px sin agrandar la línea de metadatos. */
            className="relative text-[13px] font-medium text-fg-muted underline decoration-fg-subtle underline-offset-4 transition-colors after:absolute after:-inset-x-2 after:-inset-y-[0.9rem] after:content-[''] hover:text-fg hover:decoration-fg"
          >
            {explorerLabel}
            <span className="sr-only"> {explorerNew}</span>
          </a>
        ) : null}
      </div>
    </div>
  );
}
