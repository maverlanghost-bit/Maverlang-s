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
        <h1 className="text-2xl text-balance sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-muted">{description}</p> : null}
      </div>
      {action ?? null}
    </header>
  );
}
