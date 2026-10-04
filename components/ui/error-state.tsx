import { Button } from "@/components/ui/button";

export function ErrorState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-3xl border border-border bg-down-bg px-6 py-10 text-center">
      <p className="text-sm font-medium text-down">Error</p>
      <p className="font-medium text-fg">{title}</p>
      {description ? <p className="max-w-sm text-sm leading-relaxed text-fg-body">{description}</p> : null}
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}
