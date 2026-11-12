"use client";

import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { useT } from "@/lib/hooks/use-t";

export function NotFoundView({ kind }: { kind: "page" | "ticker" }) {
  const { t } = useT();
  const ticker = kind === "ticker";

  return (
    <div className="flex max-w-md flex-col items-start gap-5 py-10 sm:py-14">
      <p className="font-mono text-[13px] leading-5 font-medium tracking-[0.045em] text-fg-muted uppercase">
        {t.notFound.code}
      </p>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl leading-[1.1] tracking-tight text-balance sm:text-4xl">
          {ticker ? t.notFound.tickerTitle : t.notFound.pageTitle}
        </h1>
        <p className="text-sm leading-relaxed text-pretty text-fg-muted">
          {ticker ? t.notFound.tickerBody : t.notFound.pageBody}
        </p>
      </div>
      <Link
        href={ticker ? "/app" : "/"}
        className={buttonClasses({ variant: "primary", className: "min-h-11" })}
      >
        {ticker ? t.notFound.tickerAction : t.notFound.pageAction}
      </Link>
    </div>
  );
}
