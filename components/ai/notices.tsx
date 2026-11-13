import { Button } from "@/components/ui/button";
import type { AsistenteCopy } from "@/content/i18n/extra-asistente";
import type { ChatNotice } from "@/components/ai/model";

export function NoticeCard({
  notice,
  copy,
  onRetry,
}: {
  notice: ChatNotice;
  copy: AsistenteCopy;
  onRetry?: () => void;
}) {
  if (notice.kind === "not_configured") {
    return (
      <div role="status" data-ai-notice="not_configured" className="min-w-0 rounded-2xl border border-border/70 bg-surface-1 px-4 py-4">
        <p className="text-pretty text-base font-medium text-fg break-words">{notice.message.trim() || copy.notConfigured}</p>
        <p className="mt-1 text-sm leading-relaxed text-fg-muted">{copy.notConfiguredHint}</p>
      </div>
    );
  }

  if (notice.kind === "rate_limited") {
    return (
      <div role="status" data-ai-notice="rate_limited" className="min-w-0 rounded-2xl border border-warn/25 bg-warn-bg px-4 py-4">
        <p className="text-base font-medium text-warn">{copy.rateTitle}</p>
        <p className="mt-1 text-sm leading-relaxed break-words text-fg-body">{notice.message.trim() || copy.rateBody}</p>
        {onRetry ? (
          <Button variant="secondary" className="mt-3 min-h-11 w-full sm:w-auto" onClick={onRetry}>
            {copy.retry}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div role="alert" data-ai-notice={notice.kind} className="min-w-0 rounded-2xl border border-down/25 bg-down-bg px-4 py-4">
      <p className="text-base font-medium text-down">{copy.errorTitle}</p>
      <p className="mt-1 text-sm leading-relaxed break-words text-fg-body">{notice.message.trim() || copy.errorBody}</p>
      {onRetry ? (
        <Button variant="secondary" className="mt-3 min-h-11 w-full sm:w-auto" onClick={onRetry}>
          {copy.retry}
        </Button>
      ) : null}
    </div>
  );
}
