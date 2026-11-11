import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {/* D1: la H1 de página es una sola en todo el sitio (3xl/4xl). */}
        <h1 className="text-3xl leading-[1.1] tracking-tight text-balance sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-muted">{description}</p> : null}
      </div>
      {action ?? null}
    </header>
  );
}
