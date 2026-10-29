"use client";

import Link from "next/link";

import { askAiHref, cleanTicker } from "@/components/ai/model";
import { cn } from "@/lib/cn";
import { asistenteText, fillAsistente } from "@/content/i18n/extra-asistente";
import { useT } from "@/lib/hooks/use-t";

/**
 * Botón flotante para la ficha. No se monta solo: la ficha lo coloca.
 * Lleva a `/app/asistente?ticker=…`. No compra.
 */
export function AskAiButton({ ticker, className }: { ticker: string; className?: string }) {
  const { language } = useT();
  const copy = asistenteText(language);
  return <AskAiLink ticker={ticker} label={copy.ask} about={copy.askAbout} className={className} />;
}

export function AskAiLink({
  ticker,
  label,
  about,
  className,
}: {
  ticker: string;
  label: string;
  about: string;
  className?: string;
}) {
  const symbol = cleanTicker(ticker);
  return (
    <Link
      href={askAiHref(ticker)}
      aria-label={symbol ? fillAsistente(about, { ticker: symbol }) : label}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border/70 bg-bg px-3.5 text-sm text-fg outline-none transition duration-[140ms] ease-spring hover:bg-surface-1 focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98]",
        className,
      )}
    >
      <SparkIcon />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" aria-hidden>
      <path
        d="M8 1.6 9.1 6.2 13.6 8 9.1 9.8 8 14.4 6.9 9.8 2.4 8 6.9 6.2 8 1.6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
