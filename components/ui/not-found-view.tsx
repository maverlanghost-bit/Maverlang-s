"use client";

import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { useT } from "@/lib/hooks/use-t";

export function NotFoundView({ kind }: { kind: "page" | "ticker" }) {
  const { t } = useT();
  const ticker = kind === "ticker";

  return (
    <div className="flex max-w-md flex-col items-start gap-4 py-8">
      <p className="label">{t.notFound.code}</p>
      <h1 className="text-3xl text-balance">{ticker ? t.notFound.tickerTitle : t.notFound.pageTitle}</h1>
      <p className="text-sm leading-relaxed text-fg-muted">{ticker ? t.notFound.tickerBody : t.notFound.pageBody}</p>
      <Link href={ticker ? "/app" : "/"} className={buttonClasses({ variant: "primary" })}>
        {ticker ? t.notFound.tickerAction : t.notFound.pageAction}
      </Link>
    </div>
  );
}
