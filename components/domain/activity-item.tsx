import type { ReactNode } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";

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
    <div className="flex flex-col gap-2 rounded-xl border-b border-border/60 px-2 py-3 transition-colors duration-150 last:border-b-0 hover:bg-bg-subtle/60 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-fg">{title}</p>
        <p className="num mt-0.5 text-sm tabular-nums tracking-tight text-fg-muted">{detail}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">
        <span className="inline-flex shrink-0 items-center rounded-full border border-border/80 p-px ring-1 ring-border/50">
          <Badge tone={tone}>{status}</Badge>
        </span>
        <time dateTime={dateTime} className="text-sm text-fg-muted">
          {time}
        </time>
        {explorerHref ? (
          <a
            href={explorerHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-fg underline underline-offset-4"
          >
            {explorerLabel}
            <span className="sr-only"> {explorerNew}</span>
          </a>
        ) : null}
      </div>
    </div>
  );
}
