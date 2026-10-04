import type { ReactNode } from "react";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border-strong px-6 py-10 text-center">
      <p className="font-medium text-fg">{title}</p>
      {description ? <p className="max-w-sm text-sm leading-relaxed text-fg-muted">{description}</p> : null}
      {action ?? null}
    </div>
  );
}
