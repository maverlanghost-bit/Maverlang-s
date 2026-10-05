import { Button } from "@/components/ui/button";

export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = "Reintentar",
  label = "Error",
}: {
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  label?: string;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-3xl border border-border bg-down-bg px-6 py-10 text-center">
      <p className="text-sm font-medium text-down">{label}</p>
      <p className="font-medium text-fg">{title}</p>
      {description ? <p className="max-w-sm text-sm leading-relaxed text-fg-body">{description}</p> : null}
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
